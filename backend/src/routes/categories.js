const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifierToken, autoriserRoles } = require('../middlewares/auth');

// Liste des catégories d'un restaurant (public, le restaurant_id vient du client)
router.get('/', async (req, res) => {
  const restaurantId = req.query.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id est obligatoire' });
  }
  try {
    const resultat = await pool.query(
      'SELECT * FROM categories WHERE restaurant_id = $1 ORDER BY nom',
      [restaurantId]
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer une catégorie dans son propre restaurant (admin uniquement)
router.post('/', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const { nom } = req.body;
  if (!nom) {
    return res.status(400).json({ message: 'nom est obligatoire' });
  }
  try {
    const resultat = await pool.query(
      'INSERT INTO categories (nom, restaurant_id) VALUES ($1, $2) RETURNING *',
      [nom, req.utilisateur.restaurant_id]
    );
    res.status(201).json(resultat.rows[0]);
  } catch (erreur) {
    if (erreur.code === '23505') {
      return res.status(409).json({ message: 'Cette catégorie existe déjà' });
    }
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer une catégorie de son propre restaurant (admin uniquement)
router.delete('/:id', verifierToken, autoriserRoles('admin'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE plats SET categorie_id = NULL WHERE categorie_id = $1 AND restaurant_id = $2',
      [req.params.id, req.utilisateur.restaurant_id]
    );
    await pool.query(
      'DELETE FROM categories WHERE id = $1 AND restaurant_id = $2',
      [req.params.id, req.utilisateur.restaurant_id]
    );
    res.status(204).send();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;