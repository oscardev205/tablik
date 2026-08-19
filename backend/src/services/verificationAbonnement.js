const pool = require('../db');

async function verifierEtMettreAJourExpiration(restaurantId) {
  const resultat = await pool.query('SELECT * FROM restaurants WHERE id = $1', [restaurantId]);
  const restaurant = resultat.rows[0];
  if (!restaurant) return null;

  const maintenant = new Date();
  let expire = false;

  if (restaurant.statut === 'essai' && restaurant.date_fin_essai && new Date(restaurant.date_fin_essai) < maintenant) {
    expire = true;
  }
  if (restaurant.statut === 'actif' && restaurant.date_fin_abonnement && new Date(restaurant.date_fin_abonnement) < maintenant) {
    expire = true;
  }

  if (expire) {
    const maj = await pool.query("UPDATE restaurants SET statut = 'expire' WHERE id = $1 RETURNING *", [restaurantId]);
    return maj.rows[0];
  }

  return restaurant;
}

module.exports = { verifierEtMettreAJourExpiration };