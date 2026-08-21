const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { verifierToken, autoriserRoles } = require('../middlewares/auth');
const { verifierEtMettreAJourExpiration } = require('../services/verificationAbonnement');

const rateLimit = require('express-rate-limit');

const limiteurConnexion = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Trop de tentatives, réessayez dans quelques minutes' }
});

const limiteurInscription = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Trop de tentatives d\'inscription, réessayez plus tard' }
});

const DUREE_ESSAI_JOURS = 7;

// Inscription d'un nouveau restaurant (self-service)
router.post('/inscription-restaurant', limiteurinscription, async (req, res) => {
 const { nom_restaurant, nom_admin, telephone, identifiant, mot_de_passe, code_parrain } = req.body;

  if (!nom_restaurant || !nom_admin || !telephone || !identifiant || !mot_de_passe) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
  }
  if (mot_de_passe.length < 8 || !/[0-9]/.test(mot_de_passe) || !/[a-za-z]/.test(mot_de_passe)) {
    return res.status(400).json({ message: 'Le mot de passe doit faire au moins 8 caractères et contenir au moins une lettre et un chiffre' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dateFinEssai = new Date();
    dateFinEssai.setDate(dateFinEssai.getDate() + DUREE_ESSAI_JOURS);

    let parrainId = null;
    if (code_parrain) {
      const parrain = await client.query(
        'SELECT id FROM parrains WHERE code_parrainage = $1 AND actif = true',
        [code_parrain]
      );
      if (parrain.rows.length > 0) {
        parrainId = parrain.rows[0].id;
      }
    }

    const nouveauRestaurant = await client.query(
      `INSERT INTO restaurants (nom, statut, date_fin_essai, telephone, parrain_id) VALUES ($1, 'essai', $2, $3, $4) RETURNING *`,
      [nom_restaurant, dateFinEssai, telephone, parrainId]
    );
    const restaurantId = nouveauRestaurant.rows[0].id;

    const motDePasseHache = await bcrypt.hash(mot_de_passe, 10);
    const nouvelAdmin = await client.query(
      `INSERT INTO utilisateurs (nom, identifiant, mot_de_passe, role, restaurant_id, doit_changer_mot_de_passe)
       VALUES ($1, $2, $3, 'admin', $4, FALSE) RETURNING id, nom, identifiant, role, restaurant_id`,
      [nom_admin, identifiant, motDePasseHache, restaurantId]
    );

    await client.query('COMMIT');

    const utilisateur = nouvelAdmin.rows[0];
    const token = jwt.sign(
      { id: utilisateur.id, role: utilisateur.role, nom: utilisateur.nom, restaurant_id: restaurantId },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.status(201).json({
      token,
      utilisateur: {
        id: utilisateur.id,
        nom: utilisateur.nom,
        role: utilisateur.role,
        restaurant_id: restaurantId,
        doit_changer_mot_de_passe: false
      },
      restaurant: nouveauRestaurant.rows[0]
    });
  } catch (erreur) {
    await client.query('ROLLBACK');
    if (erreur.code === '23505') {
      if (erreur.constraint && erreur.constraint.includes('telephone')) {
        return res.status(409).json({ message: 'Ce numéro de téléphone a déjà utilisé l\'essai gratuit' });
      }
      return res.status(409).json({ message: 'Cet identifiant existe déjà' });
    }
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// Connexion (admin, cuisinier ou serveur)
router.post('/login', limiteurconnexion, async (req, res) => {
  const { identifiant, mot_de_passe } = req.body;
  if (!identifiant || !mot_de_passe) {
    return res.status(400).json({ message: 'identifiant et mot_de_passe sont obligatoires' });
  }

  try {
    const resultat = await pool.query(
      'SELECT * FROM utilisateurs WHERE identifiant = $1',
      [identifiant]
    );
    const utilisateur = resultat.rows[0];

    if (!utilisateur) {
      return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect' });
    }

    if (!utilisateur.actif) {
      return res.status(403).json({ message: 'Ce compte a été désactivé' });
    }

    const motDePasseValide = await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe);
    if (!motDePasseValide) {
      return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect' });
    }

    if (utilisateur.restaurant_id) {
      await verifierEtMettreAJourExpiration(utilisateur.restaurant_id);
    }

    const token = jwt.sign(
      { id: utilisateur.id, role: utilisateur.role, nom: utilisateur.nom, restaurant_id: utilisateur.restaurant_id, parrain_id: utilisateur.parrain_id },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      utilisateur: {
        id: utilisateur.id,
        nom: utilisateur.nom,
        role: utilisateur.role,
        restaurant_id: utilisateur.restaurant_id,
        parrain_id: utilisateur.parrain_id,
        doit_changer_mot_de_passe: utilisateur.doit_changer_mot_de_passe
      }
    });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Changer son propre mot de passe (tous les rôles connectés)
router.post('/changer-mot-de-passe', verifierToken, async (req, res) => {
  const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;

  if (!ancien_mot_de_passe || !nouveau_mot_de_passe) {
    return res.status(400).json({ message: 'Les deux mots de passe sont obligatoires' });
  }
  if (nouveau_mot_de_passe.length < 6) {
    return res.status(400).json({ message: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
  }

  try {
    const resultat = await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [req.utilisateur.id]);
    const utilisateur = resultat.rows[0];

    const motDePasseValide = await bcrypt.compare(ancien_mot_de_passe, utilisateur.mot_de_passe);
    if (!motDePasseValide) {
      return res.status(401).json({ message: 'Ancien mot de passe incorrect' });
    }

    const nouveauHache = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await pool.query(
      'UPDATE utilisateurs SET mot_de_passe = $1, doit_changer_mot_de_passe = FALSE WHERE id = $2',
      [nouveauHache, utilisateur.id]
    );

    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Liste des employés du restaurant connecté (admin uniquement)
router.get('/utilisateurs', verifierToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const resultat = await pool.query(
      'SELECT id, nom, identifiant, role, actif FROM utilisateurs WHERE restaurant_id = $1 ORDER BY id',
      [req.utilisateur.restaurant_id]
    );
    res.json(resultat.rows);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Créer un employé dans le restaurant connecté (admin uniquement)
router.post('/utilisateurs', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const { nom, identifiant, mot_de_passe, role } = req.body;

  if (!nom || !identifiant || !mot_de_passe || !role) {
    return res.status(400).json({ message: 'Tous les champs sont obligatoires' });
  }
  if (!['admin', 'cuisinier', 'serveur'].includes(role)) {
    return res.status(400).json({ message: 'Rôle invalide' });
  }

  try {
    const motDePasseHache = await bcrypt.hash(mot_de_passe, 10);
    const resultat = await pool.query(
      `INSERT INTO utilisateurs (nom, identifiant, mot_de_passe, role, restaurant_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nom, identifiant, role, actif`,
      [nom, identifiant, motDePasseHache, role, req.utilisateur.restaurant_id]
    );
    res.status(201).json(resultat.rows[0]);
  } catch (erreur) {
    if (erreur.code === '23505') {
      return res.status(409).json({ message: 'Cet identifiant existe déjà' });
    }
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Activer ou désactiver un employé (admin uniquement, restreint à son propre restaurant)
router.patch('/utilisateurs/:id/statut', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const { id } = req.params;
  const { actif } = req.body;

  if (typeof actif !== 'boolean') {
    return res.status(400).json({ message: 'Le champ actif doit être vrai ou faux' });
  }
  if (Number(id) === req.utilisateur.id) {
    return res.status(400).json({ message: 'Vous ne pouvez pas désactiver votre propre compte' });
  }

  try {
    const resultat = await pool.query(
      'UPDATE utilisateurs SET actif = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING id, nom, identifiant, role, actif',
      [actif, id, req.utilisateur.restaurant_id]
    );
    if (resultat.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }
    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;