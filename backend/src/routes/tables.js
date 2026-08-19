const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../db');
const { verifierToken, autoriserRoles } = require('../middlewares/auth');

router.get('/', verifierToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const resultat = await pool.query(
      'SELECT * FROM tables_restaurant WHERE restaurant_id = $1 ORDER BY id',
      [req.utilisateur.restaurant_id]
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const { numero } = req.body;
  if (!numero) {
    return res.status(400).json({ message: 'numero est obligatoire' });
  }
  const code_qr = crypto.randomBytes(6).toString('hex');
  try {
    const resultat = await pool.query(
      'INSERT INTO tables_restaurant (numero, code_qr, restaurant_id) VALUES ($1, $2, $3) RETURNING *',
      [numero, code_qr, req.utilisateur.restaurant_id]
    );
    res.status(201).json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/:id', verifierToken, autoriserRoles('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM tables_restaurant WHERE id = $1 AND restaurant_id = $2', [req.params.id, req.utilisateur.restaurant_id]);
    res.status(204).send();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Trouver une table à partir de son code (utilisé par la page client, pas besoin de connexion)
router.get('/code/:code_qr', async (req, res) => {
  try {
    const resultat = await pool.query(
      'SELECT id, numero, restaurant_id FROM tables_restaurant WHERE code_qr = $1',
      [req.params.code_qr]
    );
    if (resultat.rows.length === 0) {
      return res.status(404).json({ message: 'Table introuvable' });
    }
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;