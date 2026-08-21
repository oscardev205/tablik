const express = require('express');
const router = express.Router();
const multer = require('multer');
const { put, del } = require('@vercel/blob');
const pool = require('../db');
const { verifierToken, autoriserRoles } = require('../middlewares/auth');
const sharp = require('sharp');

// Stockage en mémoire (pas sur disque), le fichier est ensuite envoyé directement vers Vercel Blob
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const typesAutorises = ['image/jpeg', 'image/png', 'image/webp'];
    if (typesAutorises.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format d\'image non autorisé'));
    }
  }
});

router.get('/', verifierToken, async (req, res) => {
  try {
    const resultat = await pool.query(
      `SELECT p.*, c.nom AS categorie_nom
       FROM plats p
       LEFT JOIN categories c ON c.id = p.categorie_id
       WHERE p.restaurant_id = $1
       ORDER BY p.id`,
      [req.utilisateur.restaurant_id]
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/disponibles', async (req, res) => {
  const restaurantId = req.query.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id est obligatoire' });
  }
  try {
    const resultat = await pool.query(
      `SELECT p.*, c.nom AS categorie_nom
       FROM plats p
       LEFT JOIN categories c ON c.id = p.categorie_id
       WHERE p.restaurant_id = $1 AND p.disponible = true AND p.portions_restantes > 0
       ORDER BY p.id`,
      [restaurantId]
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const { nom, prix, photo_url, portions_restantes, categorie_id } = req.body;
  if (!nom || prix === undefined) {
    return res.status(400).json({ message: 'nom et prix sont obligatoires' });
  }
  try {
    const resultat = await pool.query(
      `INSERT INTO plats (nom, prix, photo_url, portions_restantes, categorie_id, restaurant_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nom, prix, photo_url || null, portions_restantes || 0, categorie_id || null, req.utilisateur.restaurant_id]
    );
    res.status(201).json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.patch('/:id', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { nom, prix, photo_url, portions_restantes, disponible, categorie_id, mis_en_avant } = req.body;
  try {
    const resultat = await pool.query(
      `UPDATE plats SET
        nom = COALESCE($1, nom),
        prix = COALESCE($2, prix),
        photo_url = COALESCE($3, photo_url),
        portions_restantes = COALESCE($4, portions_restantes),
        disponible = COALESCE($5, disponible),
        categorie_id = COALESCE($6, categorie_id),
        mis_en_avant = COALESCE($7, mis_en_avant)
       WHERE id = $8 AND restaurant_id = $9 RETURNING *`,
      [nom, prix, photo_url, portions_restantes, disponible, categorie_id, mis_en_avant, id, req.utilisateur.restaurant_id]
    );
    if (resultat.rows.length === 0) {
      return res.status(404).json({ message: 'Plat introuvable' });
    }
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/:id', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM plats WHERE id = $1 AND restaurant_id = $2', [id, req.utilisateur.restaurant_id]);
    res.status(204).send();
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/:id/photo', verifierToken, autoriserRoles('admin'), upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Aucune image reçue' });
  }
  try {
    // Vérification réelle du contenu + compression + conversion en WebP
    let imageTraitee;
    try {
      imageTraitee = await sharp(req.file.buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    } catch (erreurImage) {
      return res.status(400).json({ message: 'Le fichier envoyé n\'est pas une image valide' });
    }

    const nomFichier = 'plats/' + req.utilisateur.restaurant_id + '-' + Date.now() + '.webp';

    const blob = await put(nomFichier, imageTraitee, {
      access: 'public',
      contentType: 'image/webp'
    });

    const resultat = await pool.query(
      'UPDATE plats SET photo_url = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *',
      [blob.url, req.params.id, req.utilisateur.restaurant_id]
    );
    if (resultat.rows.length === 0) {
      return res.status(404).json({ message: 'Plat introuvable' });
    }
    req.app.get('io').to('restaurant_' + req.utilisateur.restaurant_id).emit('menu_mis_a_jour');
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur lors de l\'envoi de la photo' });
  }
});

module.exports = router;