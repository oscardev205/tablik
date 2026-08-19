const API_URL = window.location.origin;
const token = localStorage.getItem('token');
const utilisateur = JSON.parse(localStorage.getItem('utilisateur') || 'null');

if (!token || !utilisateur || utilisateur.role !== 'parrain') {
  window.location.href = 'connexion.html';
}

document.getElementById('boutonDeconnexion').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'connexion.html';
});

function enTetesAuth() {
  return { 'Authorization': 'Bearer ' + token };
}

const LABELS_STATUT = { essai: 'Essai', actif: 'Actif', expire: 'Expiré' };

async function chargerMonProfil() {
  const reponse = await fetch(API_URL + '/parrain/moi', { headers: enTetesAuth() });
  const parrain = await reponse.json();
  const lien = API_URL + '/inscription.html?parrain=' + parrain.code_parrainage;

  document.getElementById('monPourcentage').textContent = parrain.pourcentage_commission + '%';
  document.getElementById('monLien').textContent = lien;
  document.getElementById('boutonCopierLien').onclick = () => {
    navigator.clipboard.writeText(lien);
    alert('Lien copié !');
  };
}

async function chargerMesRestaurants() {
  const reponse = await fetch(API_URL + '/parrain/mes-restaurants', { headers: enTetesAuth() });
  const restaurants = await reponse.json();
  const conteneur = document.getElementById('listeMesRestaurants');

  if (restaurants.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucun restaurant parrainé pour le moment.</div>';
    return;
  }

  conteneur.innerHTML = restaurants.map((r) => `
    <div class="item-carte">
      <span>${r.nom}</span>
      <span class="pastille ${r.statut}">${LABELS_STATUT[r.statut]}</span>
    </div>
  `).join('');
}

async function chargerMesCommissions() {
  const reponse = await fetch(API_URL + '/parrain/mes-commissions', { headers: enTetesAuth() });
  const donnees = await reponse.json();

  document.getElementById('totalCommissions').textContent = Number(donnees.total).toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('soldeDisponible').textContent = Number(donnees.soldeDisponible).toLocaleString('fr-FR') + ' FCFA';

  const conteneur = document.getElementById('listeCommissions');
  if (donnees.commissions.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune commission pour le moment.</div>';
    return;
  }

  conteneur.innerHTML = donnees.commissions.map((c) => `
    <div class="item-carte">
      <span>${c.nom_restaurant} — ${new Date(c.date_creation).toLocaleDateString('fr-FR')}</span>
      <span style="font-family:'IBM Plex Mono',monospace; color:var(--sauge); font-weight:600;">+${Number(c.montant).toLocaleString('fr-FR')} FCFA</span>
    </div>
  `).join('');
}

const LABELS_STATUT_RETRAIT = { en_attente: 'En attente', validee: 'Payé', refusee: 'Refusé' };

async function chargerMesRetraits() {
  const reponse = await fetch(API_URL + '/parrain/mes-retraits', { headers: enTetesAuth() });
  const retraits = await reponse.json();
  const conteneur = document.getElementById('listeMesRetraits');

  if (retraits.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune demande de retrait pour le moment.</div>';
    return;
  }

  conteneur.innerHTML = retraits.map((r) => `
    <div class="item-carte">
      <span>${Number(r.montant).toLocaleString('fr-FR')} FCFA — ${new Date(r.date_creation).toLocaleDateString('fr-FR')}</span>
      <span class="pastille ${r.statut === 'validee' ? 'actif' : r.statut === 'refusee' ? 'expire' : 'essai'}">${LABELS_STATUT_RETRAIT[r.statut]}</span>
    </div>
  `).join('');
}

document.getElementById('formRetrait').addEventListener('submit', async (e) => {
  e.preventDefault();
  const reponse = await fetch(API_URL + '/parrain/demande-retrait', {
    method: 'POST',
    headers: { ...enTetesAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      montant: Number(document.getElementById('montantRetrait').value),
      operateur: document.getElementById('operateurRetrait').value,
      numero_reception: document.getElementById('numeroReceptionRetrait').value
    })
  });
  if (reponse.ok) {
    document.getElementById('formRetrait').reset();
    chargerMesCommissions();
    chargerMesRetraits();
    alert('Votre demande de retrait a été envoyée.');
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
});

chargerMonProfil();
chargerMesRestaurants();
chargerMesCommissions();
chargerMesRetraits();