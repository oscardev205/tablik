const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifierToken, autoriserRoles } = require('../middlewares/auth');

router.use(verifierToken, autoriserRoles('parrain'));

// Mes infos et mon code de parrainage
router.get('/moi', async (req, res) => {
  try {
    const resultat = await pool.query('SELECT * FROM parrains WHERE id = $1', [req.utilisateur.parrain_id]);
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Restaurants que j'ai parrainés
router.get('/mes-restaurants', async (req, res) => {
  try {
    const resultat = await pool.query(
      'SELECT id, nom, statut, date_creation FROM restaurants WHERE parrain_id = $1 ORDER BY date_creation DESC',
      [req.utilisateur.parrain_id]
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

async function calculerSolde(parrainId) {
  const commissions = await pool.query(
    'SELECT COALESCE(SUM(montant), 0) AS total FROM commissions WHERE parrain_id = $1',
    [parrainId]
  );
  const retraitsReserves = await pool.query(
    "SELECT COALESCE(SUM(montant), 0) AS total FROM demandes_retrait WHERE parrain_id = $1 AND statut IN ('en_attente', 'validee')",
    [parrainId]
  );
  return Number(commissions.rows[0].total) - Number(retraitsReserves.rows[0].total);
}

// Mes commissions + solde disponible pour retrait
router.get('/mes-commissions', async (req, res) => {
  try {
    const resultat = await pool.query(
      `SELECT c.*, r.nom AS nom_restaurant
       FROM commissions c
       JOIN restaurants r ON r.id = c.restaurant_id
       WHERE c.parrain_id = $1
       ORDER BY c.date_creation DESC`,
      [req.utilisateur.parrain_id]
    );
    const total = resultat.rows.reduce((somme, c) => somme + Number(c.montant), 0);
    const soldeDisponible = await calculerSolde(req.utilisateur.parrain_id);
    res.json({ commissions: resultat.rows, total, soldeDisponible });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Demander un retrait
router.post('/demande-retrait', async (req, res) => {
  const { montant, operateur, numero_reception } = req.body;
  if (!montant || !operateur || !numero_reception) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
  }

  try {
    const soldeDisponible = await calculerSolde(req.utilisateur.parrain_id);
    if (Number(montant) > soldeDisponible) {
      return res.status(400).json({ message: 'Montant supérieur à votre solde disponible' });
    }
    if (Number(montant) <= 0) {
      return res.status(400).json({ message: 'Montant invalide' });
    }

    const resultat = await pool.query(
      `INSERT INTO demandes_retrait (parrain_id, montant, operateur, numero_reception)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.utilisateur.parrain_id, montant, operateur, numero_reception]
    );
    res.status(201).json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mes demandes de retrait
router.get('/mes-retraits', async (req, res) => {
  try {
    const resultat = await pool.query(
      'SELECT * FROM demandes_retrait WHERE parrain_id = $1 ORDER BY date_creation DESC',
      [req.utilisateur.parrain_id]
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;