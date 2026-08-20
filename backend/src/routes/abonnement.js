const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifierToken, autoriserRoles } = require('../middlewares/auth');
const { verifierEtMettreAJourExpiration } = require('../services/verificationAbonnement');

// Réglages publics (numéros de paiement, montant) — visibles sans être connecté au super admin
router.get('/parametres', verifierToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const resultat = await pool.query('SELECT * FROM parametres_plateforme LIMIT 1');
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Statut de l'abonnement du restaurant connecté
router.get('/statut', verifierToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const resultat = await pool.query('SELECT * FROM restaurants WHERE id = $1', [req.utilisateur.restaurant_id]);
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Statut d'accès pour bloquer ou débloquer l'interface (tous rôles)
router.get('/statut-acces', verifierToken, async (req, res) => {
  if (!req.utilisateur.restaurant_id) {
    return res.status(400).json({ message: 'Compte non rattaché à un restaurant' });
  }
  try {
    const restaurant = await verifierEtMettreAJourExpiration(req.utilisateur.restaurant_id);

    // Le blocage ne se déclenche que si le statut est réellement "expire"
    // (essai en cours ou actif ne bloquent jamais, même avec une demande en attente)
    if (restaurant.statut !== 'expire') {
      return res.json({ statut: restaurant.statut, demande_en_attente: false });
    }

    const demande = await pool.query(
      "SELECT id FROM demandes_paiement WHERE restaurant_id = $1 AND statut = 'en_attente' ORDER BY date_creation DESC LIMIT 1",
      [restaurant.id]
    );

    res.json({ statut: restaurant.statut, demande_en_attente: demande.rows.length > 0 });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});
// Déclarer un paiement
router.post('/demande', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const { operateur, id_transaction, nombre_mois } = req.body;
  if (!operateur || !id_transaction) {
    return res.status(400).json({ message: 'Opérateur et ID de transaction sont obligatoires' });
  }
  const mois = Number(nombre_mois) || 1;
  if (mois < 1 || mois > 12) {
    return res.status(400).json({ message: 'Nombre de mois invalide' });
  }
  try {
    const parametres = await pool.query('SELECT montant_abonnement FROM parametres_plateforme LIMIT 1');
    const montant = parametres.rows[0].montant_abonnement * mois;

    const resultat = await pool.query(
      `INSERT INTO demandes_paiement (restaurant_id, operateur, id_transaction, montant, nombre_mois)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.utilisateur.restaurant_id, operateur, id_transaction, montant, mois]
    );
    req.app.get('io').to('restaurant_' + req.utilisateur.restaurant_id).emit('abonnement_change');
    req.app.get('io').to('super_admins').emit('nouvelle_demande_paiement');
    res.status(201).json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});
// Historique des demandes du restaurant connecté
router.get('/mes-demandes', verifierToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const resultat = await pool.query(
      'SELECT * FROM demandes_paiement WHERE restaurant_id = $1 ORDER BY date_creation DESC',
      [req.utilisateur.restaurant_id]
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;