const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifierToken, autoriserRoles } = require('../middlewares/auth');

router.use(verifierToken, autoriserRoles('super_admin'));

// Demandes en attente
router.get('/demandes', async (req, res) => {
  try {
    const resultat = await pool.query(
      `SELECT d.*, r.nom AS nom_restaurant
       FROM demandes_paiement d
       JOIN restaurants r ON r.id = d.restaurant_id
       WHERE d.statut = 'en_attente'
       ORDER BY d.date_creation ASC`
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Historique des demandes déjà traitées
router.get('/historique', async (req, res) => {
  try {
    const resultat = await pool.query(
      `SELECT d.*, r.nom AS nom_restaurant
       FROM demandes_paiement d
       JOIN restaurants r ON r.id = d.restaurant_id
       WHERE d.statut != 'en_attente'
       ORDER BY d.date_traitement DESC
       LIMIT 100`
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Valider une demande : active l'abonnement, +1 mois à partir de la date de fin actuelle si pas encore expirée
router.post('/demandes/:id/valider', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const demande = await client.query('SELECT * FROM demandes_paiement WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (demande.rows.length === 0 || demande.rows[0].statut !== 'en_attente') {
      throw new Error('DEMANDE_INVALIDE');
    }

    const restaurant = await client.query('SELECT * FROM restaurants WHERE id = $1', [demande.rows[0].restaurant_id]);
    const restaurantActuel = restaurant.rows[0];

    const maintenant = new Date();
    const dateDepart = (restaurantActuel.date_fin_abonnement && new Date(restaurantActuel.date_fin_abonnement) > maintenant)
      ? new Date(restaurantActuel.date_fin_abonnement)
      : maintenant;
    const nouvelleDateFin = new Date(dateDepart);
    nouvelleDateFin.setMonth(nouvelleDateFin.getMonth() + demande.rows[0].nombre_mois);

    await client.query(
      `UPDATE restaurants SET statut = 'actif', date_fin_abonnement = $1 WHERE id = $2`,
      [nouvelleDateFin, restaurantActuel.id]
    );

    await client.query(
      `UPDATE demandes_paiement SET statut = 'validee', date_traitement = NOW() WHERE id = $1`,
      [req.params.id]
    );

    if (restaurantActuel.parrain_id) {
      const parrain = await client.query('SELECT * FROM parrains WHERE id = $1 AND actif = true', [restaurantActuel.parrain_id]);
      if (parrain.rows.length > 0) {
        const montantCommission = demande.rows[0].montant * (parrain.rows[0].pourcentage_commission / 100);
        await client.query(
          `INSERT INTO commissions (parrain_id, restaurant_id, demande_paiement_id, montant) VALUES ($1, $2, $3, $4)`,
          [parrain.rows[0].id, restaurantActuel.id, req.params.id, montantCommission]
        );
      }
    }

    await client.query('COMMIT');
    req.app.get('io').to('restaurant_' + restaurantActuel.id).emit('abonnement_change');
    res.json({ message: 'Abonnement activé', nouvelleDateFin });
  } catch (erreur) {
    await client.query('ROLLBACK');
    if (erreur.message === 'DEMANDE_INVALIDE') {
      return res.status(400).json({ message: 'Cette demande a déjà été traitée' });
    }
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// Refuser une demande
router.post('/demandes/:id/refuser', async (req, res) => {
  const { raison } = req.body;
  try {
    const resultat = await pool.query(
      `UPDATE demandes_paiement SET statut = 'refusee', raison_refus = $1, date_traitement = NOW()
       WHERE id = $2 AND statut = 'en_attente' RETURNING *`,
      [raison || null, req.params.id]
    );
    if (resultat.rows.length === 0) {
      return res.status(400).json({ message: 'Cette demande a déjà été traitée' });
    }
    req.app.get('io').to('restaurant_' + resultat.rows[0].restaurant_id).emit('abonnement_change');
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Liste de tous les restaurants
router.get('/restaurants', async (req, res) => {
  try {
    const resultat = await pool.query('SELECT * FROM restaurants ORDER BY date_creation DESC');
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Voir les réglages actuels
router.get('/parametres', async (req, res) => {
  try {
    const resultat = await pool.query('SELECT * FROM parametres_plateforme LIMIT 1');
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Modifier les réglages (montant, numéros)
router.patch('/parametres', async (req, res) => {
  const { montant_abonnement, numero_mtn, numero_moov, numero_celtiis } = req.body;
  try {
    const resultat = await pool.query(
      `UPDATE parametres_plateforme SET
        montant_abonnement = COALESCE($1, montant_abonnement),
        numero_mtn = COALESCE($2, numero_mtn),
        numero_moov = COALESCE($3, numero_moov),
        numero_celtiis = COALESCE($4, numero_celtiis)
       RETURNING *`,
      [montant_abonnement, numero_mtn, numero_moov, numero_celtiis]
    );
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Liste des parrains avec leurs statistiques
router.get('/parrains', async (req, res) => {
  try {
    const resultat = await pool.query(`
      SELECT p.*,
        COUNT(DISTINCT r.id) AS nombre_restaurants,
        COALESCE(SUM(c.montant), 0) AS total_commissions
      FROM parrains p
      LEFT JOIN restaurants r ON r.parrain_id = p.id
      LEFT JOIN commissions c ON c.parrain_id = p.id
      GROUP BY p.id
      ORDER BY p.date_creation DESC
    `);
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer un parrain (crée aussi son compte de connexion)
router.post('/parrains', async (req, res) => {
  const { nom, identifiant, mot_de_passe, pourcentage_commission } = req.body;
  if (!nom || !identifiant || !mot_de_passe || pourcentage_commission === undefined) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const codeParrainage = crypto.randomBytes(4).toString('hex');

    const nouveauParrain = await client.query(
      `INSERT INTO parrains (nom, code_parrainage, pourcentage_commission) VALUES ($1, $2, $3) RETURNING *`,
      [nom, codeParrainage, pourcentage_commission]
    );

    const motDePasseHache = await bcrypt.hash(mot_de_passe, 10);
    await client.query(
      `INSERT INTO utilisateurs (nom, identifiant, mot_de_passe, role, parrain_id, doit_changer_mot_de_passe)
       VALUES ($1, $2, $3, 'parrain', $4, FALSE)`,
      [nom, identifiant, motDePasseHache, nouveauParrain.rows[0].id]
    );

    await client.query('COMMIT');
    res.status(201).json(nouveauParrain.rows[0]);
  } catch (erreur) {
    await client.query('ROLLBACK');
    if (erreur.code === '23505') {
      return res.status(409).json({ message: 'Cet identifiant existe déjà' });
    }
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// Activer ou désactiver un parrain
router.patch('/parrains/:id/statut', async (req, res) => {
  const { actif } = req.body;
  try {
    const resultat = await pool.query(
      'UPDATE parrains SET actif = $1 WHERE id = $2 RETURNING *',
      [actif, req.params.id]
    );
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Modifier le pourcentage de commission d'un parrain
router.patch('/parrains/:id/pourcentage', async (req, res) => {
  const { pourcentage_commission } = req.body;
  try {
    const resultat = await pool.query(
      'UPDATE parrains SET pourcentage_commission = $1 WHERE id = $2 RETURNING *',
      [pourcentage_commission, req.params.id]
    );
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Demandes de retrait en attente
router.get('/retraits', async (req, res) => {
  try {
    const resultat = await pool.query(`
      SELECT dr.*, p.nom AS nom_parrain
      FROM demandes_retrait dr
      JOIN parrains p ON p.id = dr.parrain_id
      WHERE dr.statut = 'en_attente'
      ORDER BY dr.date_creation ASC
    `);
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Valider un retrait (toi tu as déjà envoyé l'argent au parrain à ce stade)
router.post('/retraits/:id/valider', async (req, res) => {
  try {
    const resultat = await pool.query(
      `UPDATE demandes_retrait SET statut = 'validee', date_traitement = NOW()
       WHERE id = $1 AND statut = 'en_attente' RETURNING *`,
      [req.params.id]
    );
    if (resultat.rows.length === 0) {
      return res.status(400).json({ message: 'Cette demande a déjà été traitée' });
    }
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Refuser un retrait
router.post('/retraits/:id/refuser', async (req, res) => {
  const { raison } = req.body;
  try {
    const resultat = await pool.query(
      `UPDATE demandes_retrait SET statut = 'refusee', raison_refus = $1, date_traitement = NOW()
       WHERE id = $2 AND statut = 'en_attente' RETURNING *`,
      [raison || null, req.params.id]
    );
    if (resultat.rows.length === 0) {
      return res.status(400).json({ message: 'Cette demande a déjà été traitée' });
    }
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Historique des retraits déjà traités
router.get('/retraits-historique', async (req, res) => {
  try {
    const resultat = await pool.query(`
      SELECT dr.*, p.nom AS nom_parrain
      FROM demandes_retrait dr
      JOIN parrains p ON p.id = dr.parrain_id
      WHERE dr.statut != 'en_attente'
      ORDER BY dr.date_traitement DESC
      LIMIT 100
    `);
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;