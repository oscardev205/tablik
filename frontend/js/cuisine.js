const API_URL = window.location.origin;
const token = localStorage.getItem('token');
const utilisateur = JSON.parse(localStorage.getItem('utilisateur') || 'null');

if (!token || !utilisateur || utilisateur.role !== 'cuisinier') {
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

  const nouvelles = commandes.filter((c) => c.statut === 'nouvelle');
  const enPreparation = commandes.filter((c) => c.statut === 'en_preparation');

  document.getElementById('listeNouvelles').innerHTML = nouvelles.length
    ? nouvelles.map((c) => carteCommande(c, 'en_preparation', 'Lancer en préparation', 'vers-preparation')).join('')
    : '<div class="vide">Aucune nouvelle commande.</div>';

  document.getElementById('listePreparation').innerHTML = enPreparation.length
    ? enPreparation.map((c) => carteCommande(c, 'prete', 'Marquer prête', 'vers-prete')).join('')
    : '<div class="vide">Rien en préparation.</div>';
}

function carteCommande(commande, prochainStatut, texteBouton, classeBouton) {
  return `
    <div class="commande-carte ${commande.statut}">
      <div class="numero">Table ${echapper(commande.numero_table)} — #${commande.id}</div>
      <h3>${commande.lignes.length} plat(s)</h3>
      <ul>
        ${commande.lignes.map((l) => `<li>${l.quantite} × ${echapper(l.nom)}</li>`).join('')}
      </ul>
      ${commande.note ? `<div style="background: rgba(224,152,42,0.12); color: var(--safran); font-size:12.5px; font-weight:600; padding:8px 10px; border-radius:6px; margin-bottom:12px;">📝 ${echapper(commande.note)}</div>` : ''}
      <button class="bouton-etape ${classeBouton}" onclick="changerStatut(${commande.id}, '${prochainStatut}')">
        ${texteBouton}
      </button>
    </div>
  `;
}

async function changerStatut(id, statut) {
  await fetch(API_URL + '/commandes/' + id + '/statut', {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({ statut })
  });
  chargerCommandes();
}

const socket = io(API_URL);
socket.on('connect', () => {
  socket.emit('rejoindre_restaurant', utilisateur.restaurant_id);
});
socket.on('nouvelle_commande', () => {
  chargerCommandes();
  notifier('Nouvelle commande', 'Une commande vient d\'arriver en cuisine');
});
socket.on('statut_commande_change', chargerCommandes);

chargerCommandes();