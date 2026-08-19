const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifierToken, autoriserRoles } = require('../middlewares/auth');

const STATUTS_VALIDES = ['nouvelle', 'en_preparation', 'prete', 'servie'];
const dernieresCommandesParTable = new Map();
const DELAI_MINIMUM_MS = 3000;

router.get('/', verifierToken, async (req, res) => {
  try {
    const commandes = await pool.query(
      `SELECT c.*, t.numero AS numero_table
       FROM commandes c
       JOIN tables_restaurant t ON t.id = c.table_id
       WHERE c.restaurant_id = $1
       ORDER BY c.date_creation DESC`,
      [req.utilisateur.restaurant_id]
    );

    const idsCommandes = commandes.rows.map((c) => c.id);
    const lignes = idsCommandes.length
      ? await pool.query(
          `SELECT lc.commande_id, lc.quantite, p.nom, p.prix
           FROM lignes_commande lc
           JOIN plats p ON p.id = lc.plat_id
           WHERE lc.commande_id = ANY($1::int[])`,
          [idsCommandes]
        )
      : { rows: [] };

    const commandesAvecLignes = commandes.rows.map((commande) => ({
      ...commande,
      lignes: lignes.rows.filter((l) => l.commande_id === commande.id)
    }));

    res.json(commandesAvecLignes);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/historique', verifierToken, autoriserRoles('admin'), async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const commandes = await pool.query(
      `SELECT c.*, t.numero AS numero_table
       FROM commandes c
       JOIN tables_restaurant t ON t.id = c.table_id
       WHERE c.statut = 'servie' AND DATE(c.date_creation) = $1 AND c.restaurant_id = $2
       ORDER BY c.date_creation DESC`,
      [date, req.utilisateur.restaurant_id]
    );

    const idsCommandes = commandes.rows.map((c) => c.id);
    const lignes = idsCommandes.length
      ? await pool.query(
          `SELECT lc.commande_id, lc.quantite, p.nom, p.prix
           FROM lignes_commande lc
           JOIN plats p ON p.id = lc.plat_id
           WHERE lc.commande_id = ANY($1::int[])`,
          [idsCommandes]
        )
      : { rows: [] };

    let totalJour = 0;
    const commandesAvecLignes = commandes.rows.map((commande) => {
      const lignesCommande = lignes.rows.filter((l) => l.commande_id === commande.id);
      const totalCommande = lignesCommande.reduce((somme, l) => somme + Number(l.prix) * l.quantite, 0);
      totalJour += totalCommande;
      return { ...commande, lignes: lignesCommande, total: totalCommande };
    });

    const ventesParPlat = {};
    lignes.rows.forEach((ligne) => {
      if (!ventesParPlat[ligne.nom]) {
        ventesParPlat[ligne.nom] = { nom: ligne.nom, quantite: 0, montant: 0 };
      }
      ventesParPlat[ligne.nom].quantite += ligne.quantite;
      ventesParPlat[ligne.nom].montant += Number(ligne.prix) * ligne.quantite;
    });

    const recapPlats = Object.values(ventesParPlat).sort((a, b) => b.quantite - a.quantite);

    res.json({ date, commandes: commandesAvecLignes, totalJour, recapPlats });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/:id/statut-actuel', async (req, res) => {
  try {
    const commande = await pool.query(
      `SELECT c.id, c.statut, c.table_id, t.numero AS numero_table
       FROM commandes c
       JOIN tables_restaurant t ON t.id = c.table_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (commande.rows.length === 0) {
      return res.status(404).json({ message: 'Commande introuvable' });
    }
    const lignes = await pool.query(
      `SELECT lc.quantite, p.nom
       FROM lignes_commande lc
       JOIN plats p ON p.id = lc.plat_id
       WHERE lc.commande_id = $1`,
      [req.params.id]
    );
    res.json({ ...commande.rows[0], lignes: lignes.rows });
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
  const { table_id, lignes, note } = req.body;
  if (!table_id || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ message: 'table_id et lignes sont obligatoires' });
  }

  const derniereFois = dernieresCommandesParTable.get(table_id);
  const maintenant = Date.now();
  if (derniereFois && (maintenant - derniereFois) < DELAI_MINIMUM_MS) {
    return res.status(429).json({ message: 'Merci de patienter quelques secondes avant de recommander' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const table = await client.query('SELECT restaurant_id FROM tables_restaurant WHERE id = $1', [table_id]);
    if (table.rows.length === 0) {
      throw new Error('TABLE_INTROUVABLE');
    }
    const restaurantId = table.rows[0].restaurant_id;

    const nouvelleCommande = await client.query(
      `INSERT INTO commandes (table_id, statut, note, restaurant_id) VALUES ($1, 'nouvelle', $2, $3) RETURNING *`,
      [table_id, note || null, restaurantId]
    );
    const commandeId = nouvelleCommande.rows[0].id;

    for (const ligne of lignes) {
      const plat = await client.query('SELECT * FROM plats WHERE id = $1 AND restaurant_id = $2 FOR UPDATE', [ligne.plat_id, restaurantId]);
      if (plat.rows.length === 0) {
        throw new Error('PLAT_INTROUVABLE');
      }
      if (!plat.rows[0].disponible) {
        throw Object.assign(new Error('PLAT_INDISPONIBLE'), { nomPlat: plat.rows[0].nom });
      }
      if (plat.rows[0].portions_restantes < ligne.quantite) {
        throw Object.assign(new Error('STOCK_INSUFFISANT'), {
          nomPlat: plat.rows[0].nom,
          disponible: plat.rows[0].portions_restantes
        });
      }

      await client.query(
        `INSERT INTO lignes_commande (commande_id, plat_id, quantite) VALUES ($1, $2, $3)`,
        [commandeId, ligne.plat_id, ligne.quantite]
      );

      await client.query(
        `UPDATE plats SET portions_restantes = portions_restantes - $1 WHERE id = $2`,
        [ligne.quantite, ligne.plat_id]
      );
    }

    await client.query('COMMIT');
    dernieresCommandesParTable.set(table_id, maintenant);

    const io = req.app.get('io');
    io.to('restaurant_' + restaurantId).emit('nouvelle_commande', { commandeId, table_id });
    io.to('restaurant_' + restaurantId).emit('menu_mis_a_jour');

    res.status(201).json({ id: commandeId, table_id, statut: 'nouvelle' });
  } catch (erreur) {
    await client.query('ROLLBACK');
    if (erreur.message === 'STOCK_INSUFFISANT') {
      return res.status(409).json({
        message: `Il ne reste plus assez de "${erreur.nomPlat}" (${erreur.disponible} disponible(s))`,
        code: 'STOCK_INSUFFISANT'
      });
    }
    if (erreur.message === 'PLAT_INDISPONIBLE') {
      return res.status(409).json({
        message: `"${erreur.nomPlat}" n'est plus disponible`,
        code: 'PLAT_INDISPONIBLE'
      });
    }
    if (erreur.message === 'PLAT_INTROUVABLE' || erreur.message === 'TABLE_INTROUVABLE') {
      return res.status(404).json({ message: 'Table ou plat introuvable' });
    }
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

router.patch('/:id/statut', verifierToken, autoriserRoles('admin', 'cuisinier', 'serveur'), async (req, res) => {
  const { id } = req.params;
  const { statut } = req.body;

  if (!STATUTS_VALIDES.includes(statut)) {
    return res.status(400).json({ message: 'Statut invalide' });
  }

  try {
    const resultat = await pool.query(
      'UPDATE commandes SET statut = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *',
      [statut, id, req.utilisateur.restaurant_id]
    );
    if (resultat.rows.length === 0) {
      return res.status(404).json({ message: 'Commande introuvable' });
    }

    const io = req.app.get('io');
    const restaurantId = resultat.rows[0].restaurant_id;
    io.to('restaurant_' + restaurantId).emit('statut_commande_change', { commandeId: id, statut });

    res.json(resultat.rows[0]);
  } catch (erreur) {
    console.error(erreur);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;