const API_URL = window.location.origin;
const token = localStorage.getItem('token');
const utilisateur = JSON.parse(localStorage.getItem('utilisateur') || 'null');
if (!token || !utilisateur || utilisateur.role !== 'serveur') {
  window.location.href = 'connexion.html';
} else if (utilisateur.doit_changer_mot_de_passe) {
  window.location.href = 'changer-mot-de-passe.html';
}

document.getElementById('nomUtilisateur').textContent = utilisateur ? utilisateur.nom : '';
document.getElementById('boutonDeconnexion').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'connexion.html';
});

function enTetesAuth() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

async function chargerCommandes() {
  const reponse = await fetch(API_URL + '/commandes', { headers: enTetesAuth() });
  const commandes = await reponse.json();
  const pretes = commandes.filter((c) => c.statut === 'prete');

  document.getElementById('listePretes').innerHTML = pretes.length
    ? pretes.map((c) => `
        <div class="commande-carte">
          <div>
            <div class="numero">Table ${c.numero_table} — #${c.id}</div>
            <h3>${c.lignes.length} plat(s)</h3>
            <ul>
              ${c.lignes.map((l) => `<li>${l.quantite} × ${l.nom}</li>`).join('')}
            </ul>
          </div>
          <button class="bouton-etape" onclick="changerStatut(${c.id})">Marquer servie</button>
        </div>
      `).join('')
    : '<div class="vide">Aucune commande prête pour le moment.</div>';
}

async function changerStatut(id) {
  await fetch(API_URL + '/commandes/' + id + '/statut', {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({ statut: 'servie' })
  });
  chargerCommandes();
}

const socket = io(API_URL);
socket.on('connect', () => {
  socket.emit('rejoindre_restaurant', utilisateur.restaurant_id);
});
socket.on('nouvelle_commande', chargerCommandes);
socket.on('statut_commande_change', (donnees) => {
  chargerCommandes();
  if (donnees.statut === 'prete') {
    notifier('Commande prête', 'Une commande est prête à être servie');
  }
});

chargerCommandes();