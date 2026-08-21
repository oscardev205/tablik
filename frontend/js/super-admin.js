const API_URL = window.location.origin;
const token = localStorage.getItem('token');
const utilisateur = JSON.parse(localStorage.getItem('utilisateur') || 'null');

if (!token || !utilisateur || utilisateur.role !== 'super_admin') {
  window.location.href = 'connexion.html';
}

document.getElementById('boutonDeconnexion').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'connexion.html';
});

function enTetesAuth() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

function formaterDate(dateIso) {
  if (!dateIso) return 'Non renseignée';
  return new Date(dateIso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Navigation entre onglets
document.querySelectorAll('.onglet').forEach((onglet) => {
  onglet.addEventListener('click', () => {
    document.querySelectorAll('.onglet').forEach((o) => o.classList.remove('actif'));
    document.querySelectorAll('.panneau').forEach((p) => p.classList.remove('actif'));
    onglet.classList.add('actif');
    document.getElementById(onglet.dataset.panneau).classList.add('actif');
  });
});

const LABELS_OPERATEUR = { mtn: 'MTN Mobile Money', moov: 'Moov Money', celtiis: 'Celtiis Cash' };
const LABELS_STATUT_RESTAURANT = { essai: 'Essai', actif: 'Actif', expire: 'Expiré' };

// --- DEMANDES EN ATTENTE ---
async function chargerDemandes() {
  const reponse = await fetch(API_URL + '/superadmin/demandes', { headers: enTetesAuth() });
  const demandes = await reponse.json();
  const conteneur = document.getElementById('listeDemandes');

  if (demandes.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune demande en attente.</div>';
    return;
  }

  conteneur.innerHTML = demandes.map((d) => `
    <div class="demande-carte">
      <div class="demande-info">
        <div class="numero">${formaterDate(d.date_creation)}</div>
        <h3>${echapper(d.nom_restaurant)}</h3>
        <div class="detail">${LABELS_OPERATEUR[d.operateur]} — ${d.nombre_mois} mois — ${Number(d.montant).toLocaleString('fr-FR')} FCFA — ID : ${d.id_transaction}</div>
      </div>
      <div class="actions-demande">
        <button class="bouton-valider" onclick="validerDemande(${d.id})">Valider</button>
        <button class="bouton-refuser" onclick="refuserDemande(${d.id})">Refuser</button>
      </div>
    </div>
  `).join('');
}

async function validerDemande(id) {
  if (!confirm('Confirmer la réception de ce paiement et activer l\'abonnement ?')) return;
  const reponse = await fetch(API_URL + '/superadmin/demandes/' + id + '/valider', {
    method: 'POST',
    headers: enTetesAuth()
  });
  if (reponse.ok) {
    chargerDemandes();
    chargerRestaurants();
    chargerHistoriqueDemandes();
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
}

async function refuserDemande(id) {
  const raison = prompt('Raison du refus (optionnel) :');
  if (raison === null) return;
  const reponse = await fetch(API_URL + '/superadmin/demandes/' + id + '/refuser', {
    method: 'POST',
    headers: enTetesAuth(),
    body: JSON.stringify({ raison })
  });
  if (reponse.ok) {
    chargerDemandes();
    chargerHistoriqueDemandes();
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
}

// --- HISTORIQUE DES DEMANDES TRAITÉES ---
async function chargerHistoriqueDemandes() {
  const reponse = await fetch(API_URL + '/superadmin/historique', { headers: enTetesAuth() });
  const demandes = await reponse.json();
  const conteneur = document.getElementById('listeHistoriqueDemandes');

  if (demandes.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucun historique pour le moment.</div>';
    return;
  }

  conteneur.innerHTML = demandes.map((d) => `
    <div class="demande-carte">
      <div class="demande-info">
        <div class="numero">${formaterDate(d.date_traitement)}</div>
        <h3>${echapper(d.nom_restaurant)}</h3>
        <div class="detail">${LABELS_OPERATEUR[d.operateur]} — ${d.nombre_mois} mois — ${Number(d.montant).toLocaleString('fr-FR')} FCFA</div>
      </div>
      <span class="pastille ${d.statut}">${d.statut === 'validee' ? 'Validée' : 'Refusée'}</span>
    </div>
  `).join('');
}

// --- TOUS LES RESTAURANTS ---
let tousLesRestaurants = [];

async function chargerRestaurants() {
  const reponse = await fetch(API_URL + '/superadmin/restaurants', { headers: enTetesAuth() });
  tousLesRestaurants = await reponse.json();
  afficherRestaurantsFiltres();
}

function afficherRestaurantsFiltres() {
  const recherche = document.getElementById('rechercheRestaurants').value.toLowerCase().trim();
  const restaurants = tousLesRestaurants.filter((r) => r.nom.toLowerCase().includes(recherche));
  const corps = document.getElementById('corpsTableauRestaurants');

  if (restaurants.length === 0) {
    corps.innerHTML = '<tr><td colspan="4" class="vide">Aucun restaurant trouvé.</td></tr>';
    return;
  }

  corps.innerHTML = restaurants.map((r) => `
    <tr>
      <td>${echapper(r.nom)}</td>
      <td><span class="pastille ${r.statut}">${LABELS_STATUT_RESTAURANT[r.statut]}</span></td>
      <td>${r.statut === 'essai' ? formaterDate(r.date_fin_essai) : formaterDate(r.date_fin_abonnement)}</td>
      <td>${echapper(r.telephone) || '—'}</td>
    </tr>
  `).join('');
}

document.getElementById('rechercheRestaurants').addEventListener('input', afficherRestaurantsFiltres);

// --- RÉGLAGES ---
async function chargerReglages() {
  const reponse = await fetch(API_URL + '/superadmin/parametres', { headers: enTetesAuth() });
  const parametres = await reponse.json();

  document.getElementById('reglageMontant').value = parametres.montant_abonnement;
  document.getElementById('reglageMtn').value = parametres.numero_mtn || '';
  document.getElementById('reglageMoov').value = parametres.numero_moov || '';
  document.getElementById('reglageCeltiis').value = parametres.numero_celtiis || '';
}

document.getElementById('formReglages').addEventListener('submit', async (e) => {
  e.preventDefault();
  const reponse = await fetch(API_URL + '/superadmin/parametres', {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({
      montant_abonnement: Number(document.getElementById('reglageMontant').value),
      numero_mtn: document.getElementById('reglageMtn').value,
      numero_moov: document.getElementById('reglageMoov').value,
      numero_celtiis: document.getElementById('reglageCeltiis').value
    })
  });
  if (reponse.ok) {
    alert('Réglages enregistrés');
  } else {
    alert('Erreur lors de l\'enregistrement');
  }
});

// --- PARRAINS ---
const BASE_URL_INSCRIPTION = window.location.origin;

async function chargerParrains() {
  const reponse = await fetch(API_URL + '/superadmin/parrains', { headers: enTetesAuth() });
  const parrains = await reponse.json();
  const conteneur = document.getElementById('listeParrains');

  if (parrains.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucun parrain pour le moment.</div>';
    return;
  }

  conteneur.innerHTML = parrains.map((p) => {
    const lien = BASE_URL_INSCRIPTION + '/inscription.html?parrain=' + p.code_parrainage;
    return `
      <div class="demande-carte">
        <div class="demande-info">
          <div class="numero">${p.nombre_restaurants} restaurant(s) parrainé(s)</div>
      <h3>${echapper(p.nom)}</h3>
          <div class="detail">Commission ${p.pourcentage_commission}% — Total gagné : ${Number(p.total_commissions).toLocaleString('fr-FR')} FCFA</div>
          <div class="detail" style="margin-top:4px; word-break:break-all;">${lien}</div>
        </div>
        <div class="actions-demande">
          <button class="bouton-valider" onclick="copierLienParrain('${lien}')">Copier le lien</button>
          <button class="bouton-refuser" onclick="basculerActifParrain(${p.id}, ${!p.actif})">${p.actif ? 'Désactiver' : 'Réactiver'}</button>
        </div>
      </div>
    `;
  }).join('');
}

function copierLienParrain(lien) {
  navigator.clipboard.writeText(lien);
  alert('Lien copié !');
}

async function basculerActifParrain(id, nouvelleValeur) {
  await fetch(API_URL + '/superadmin/parrains/' + id + '/statut', {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({ actif: nouvelleValeur })
  });
  chargerParrains();
}

document.getElementById('boutonAjouterParrain').addEventListener('click', () => {
  document.getElementById('modaleParrainFond').classList.add('actif');
});
document.getElementById('boutonAnnulerParrain').addEventListener('click', () => {
  document.getElementById('modaleParrainFond').classList.remove('actif');
});

document.getElementById('formParrain').addEventListener('submit', async (e) => {
  e.preventDefault();
  const reponse = await fetch(API_URL + '/superadmin/parrains', {
    method: 'POST',
    headers: enTetesAuth(),
    body: JSON.stringify({
      nom: document.getElementById('parrainNom').value,
      identifiant: document.getElementById('parrainIdentifiant').value,
      mot_de_passe: document.getElementById('parrainMotDePasse').value,
      pourcentage_commission: Number(document.getElementById('parrainPourcentage').value)
    })
  });
  if (reponse.ok) {
    document.getElementById('formParrain').reset();
    document.getElementById('modaleParrainFond').classList.remove('actif');
    chargerParrains();
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
});

// --- RETRAITS DES PARRAINS ---
async function chargerRetraits() {
  const reponse = await fetch(API_URL + '/superadmin/retraits', { headers: enTetesAuth() });
  const retraits = await reponse.json();
  const conteneur = document.getElementById('listeRetraits');

  if (retraits.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune demande de retrait en attente.</div>';
    return;
  }

  conteneur.innerHTML = retraits.map((r) => `
    <div class="demande-carte">
      <div class="demande-info">
        <div class="numero">${formaterDate(r.date_creation)}</div>
        <h3>${echapper(r.nom_parrain)} — ${Number(r.montant).toLocaleString('fr-FR')} FCFA</h3>
        <div class="detail">${LABELS_OPERATEUR[r.operateur]} — Numéro : ${r.numero_reception}</div>
      </div>
      <div class="actions-demande">
        <button class="bouton-valider" onclick="validerRetrait(${r.id})">J'ai payé</button>
        <button class="bouton-refuser" onclick="refuserRetrait(${r.id})">Refuser</button>
      </div>
    </div>
  `).join('');
}

async function chargerHistoriqueRetraits() {
  const reponse = await fetch(API_URL + '/superadmin/retraits-historique', { headers: enTetesAuth() });
  const retraits = await reponse.json();
  const conteneur = document.getElementById('listeHistoriqueRetraits');

  if (retraits.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucun retrait traité pour le moment.</div>';
    return;
  }

  conteneur.innerHTML = retraits.map((r) => `
    <div class="demande-carte">
      <div class="demande-info">
        <div class="numero">${formaterDate(r.date_traitement)}</div>
        <h3>${echapper(r.nom_parrain)} — ${Number(r.montant).toLocaleString('fr-FR')} FCFA</h3>
        <div class="detail">${LABELS_OPERATEUR[r.operateur]} — Numéro : ${r.numero_reception}</div>
        ${r.raison_refus ? `<div class="detail" style="color:var(--piment);">Motif : ${r.raison_refus}</div>` : ''}
      </div>
      <span class="pastille ${r.statut === 'validee' ? 'actif' : 'expire'}">${r.statut === 'validee' ? 'Payé' : 'Refusé'}</span>
    </div>
  `).join('');
}

async function validerRetrait(id) {
  if (!confirm('Confirmer que vous avez envoyé cet argent au parrain ?')) return;
  const reponse = await fetch(API_URL + '/superadmin/retraits/' + id + '/valider', {
    method: 'POST',
    headers: enTetesAuth()
  });
  if (reponse.ok) {
    chargerRetraits();
    chargerHistoriqueRetraits();
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
}

async function refuserRetrait(id) {
  const raison = prompt('Raison du refus (optionnel) :');
  if (raison === null) return;
  const reponse = await fetch(API_URL + '/superadmin/retraits/' + id + '/refuser', {
    method: 'POST',
    headers: enTetesAuth(),
    body: JSON.stringify({ raison })
  });
  if (reponse.ok) {
    chargerRetraits();
    chargerHistoriqueRetraits();
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
}

// --- TEMPS RÉEL ---
const socket = io(API_URL);
socket.on('connect', () => {
  socket.emit('rejoindre_super_admin');
});
socket.on('nouvelle_demande_paiement', () => {
  notifier('Nouvelle demande de paiement', 'Un restaurant a déclaré un paiement');
  chargerDemandes();
});
socket.on('nouvelle_demande_retrait', () => {
  notifier('Nouvelle demande de retrait', 'Un parrain souhaite retirer ses gains');
  chargerRetraits();
});

// Chargement initial
chargerDemandes();
chargerHistoriqueDemandes();
chargerRestaurants();
chargerReglages();
chargerParrains();
chargerRetraits();
chargerHistoriqueRetraits();