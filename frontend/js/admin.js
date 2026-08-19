const API_URL = window.location.origin;
const token = localStorage.getItem('token');
const utilisateur = JSON.parse(localStorage.getItem('utilisateur') || 'null');

if (!token || !utilisateur || utilisateur.role !== 'admin') {
  window.location.href = 'connexion.html';
}

document.getElementById('nomUtilisateur').textContent = utilisateur ? utilisateur.nom : '';

document.getElementById('boutonDeconnexion').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'connexion.html';
});

function enTetesAuth() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

// Navigation entre onglets
function activerOnglet(nomPanneau) {
  document.querySelectorAll('.onglet').forEach((o) => o.classList.remove('actif'));
  document.querySelectorAll('.panneau').forEach((p) => p.classList.remove('actif'));
  document.querySelector('.onglet[data-panneau="' + nomPanneau + '"]').classList.add('actif');
  document.getElementById(nomPanneau).classList.add('actif');
  localStorage.setItem('ongletAdminActif', nomPanneau);
}

document.querySelectorAll('.onglet').forEach((onglet) => {
  onglet.addEventListener('click', () => {
    activerOnglet(onglet.dataset.panneau);
  });
});

const ongletMemorise = localStorage.getItem('ongletAdminActif');
if (ongletMemorise && document.getElementById(ongletMemorise)) {
  activerOnglet(ongletMemorise);
}

const LABELS_STATUT = {
  nouvelle: 'Nouvelle',
  en_preparation: 'En préparation',
  prete: 'Prête',
  servie: 'Servie'
};

function ouvrirPhoto(url) {
  document.getElementById('modalePhotoImage').src = url;
  document.getElementById('modalePhotoFond').classList.add('actif');
}

function fermerPhoto(event) {
  if (event) event.stopPropagation();
  document.getElementById('modalePhotoFond').classList.remove('actif');
}

// --- COMMANDES ---
async function chargerCommandes() {
  const reponse = await fetch(API_URL + '/commandes', { headers: enTetesAuth() });
  const toutesCommandes = await reponse.json();
  const commandes = toutesCommandes.filter((c) => c.statut !== 'servie');
  const conteneur = document.getElementById('listeCommandes');

  if (commandes.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune commande en cours.</div>';
    return;
  }

  conteneur.innerHTML = commandes.map((commande) => `
    <div class="commande-carte ${commande.statut}">
      <div class="commande-info">
        <div class="numero">Table ${commande.numero_table} — #${commande.id}</div>
        <h3>${commande.lignes.length} plat(s)</h3>
        <ul>
          ${commande.lignes.map((l) => `<li>${l.quantite} × ${l.nom}</li>`).join('')}
        </ul>
        ${commande.note ? `<div style="background: rgba(224,152,42,0.12); color: var(--safran); font-size:12px; font-weight:600; padding:6px 9px; border-radius:6px; margin-bottom:8px;">📝 ${commande.note}</div>` : ''}
      </div>
      <select class="statut-select" onchange="changerStatut(${commande.id}, this.value)">
        ${Object.entries(LABELS_STATUT).map(([valeur, label]) =>
          `<option value="${valeur}" ${commande.statut === valeur ? 'selected' : ''}>${label}</option>`
        ).join('')}
      </select>
    </div>
  `).join('');
}

async function changerStatut(id, statut) {
  await fetch(API_URL + '/commandes/' + id + '/statut', {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({ statut })
  });
  chargerCommandes();
}

// --- MENU ---
const SEUIL_STOCK_BAS = 3;

let toutesLesCategories = [];
let toutLesPlats = [];

async function chargerCategories() {
  const reponse = await fetch(API_URL + '/categories?restaurant_id=' + utilisateur.restaurant_id);
  toutesLesCategories = await reponse.json();

  const tags = document.getElementById('listeCategoriesTags');
  tags.innerHTML = toutesLesCategories.map((cat) => `
    <span class="tag-categorie">
      ${cat.nom}
      <button onclick="supprimerCategorie(${cat.id})">×</button>
    </span>
  `).join('') || '<span style="color:var(--ardoise); font-size:12.5px;">Aucune catégorie pour le moment.</span>';

  const filtre = document.getElementById('filtreCategorieAdmin');
  filtre.innerHTML = '<option value="">Toutes les catégories</option>' +
    toutesLesCategories.map((cat) => `<option value="${cat.id}">${cat.nom}</option>`).join('');

  const selectModale = document.getElementById('platCategorie');
  selectModale.innerHTML = '<option value="">Aucune</option>' +
    toutesLesCategories.map((cat) => `<option value="${cat.id}">${cat.nom}</option>`).join('');
}

document.getElementById('boutonAjouterCategorie').addEventListener('click', async () => {
  const input = document.getElementById('nouvelleCategorieInput');
  const nom = input.value.trim();
  if (!nom) return;
  const reponse = await fetch(API_URL + '/categories', {
    method: 'POST',
    headers: enTetesAuth(),
    body: JSON.stringify({ nom })
  });
  if (reponse.ok) {
    input.value = '';
    chargerCategories();
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
});

async function supprimerCategorie(id) {
  if (!confirm('Supprimer cette catégorie ? Les plats concernés perdront simplement leur catégorie.')) return;
  await fetch(API_URL + '/categories/' + id, { method: 'DELETE', headers: enTetesAuth() });
  chargerCategories();
  chargerPlats();
}

document.getElementById('rechercheMenuAdmin').addEventListener('input', afficherPlatsFiltres);
document.getElementById('filtreCategorieAdmin').addEventListener('change', afficherPlatsFiltres);

async function chargerPlats() {
  const reponse = await fetch(API_URL + '/plats', { headers: enTetesAuth() });
  toutLesPlats = await reponse.json();
  afficherPlatsFiltres();
}
let platsActuels = [];

function afficherPlatsFiltres() {
  const recherche = document.getElementById('rechercheMenuAdmin').value.toLowerCase().trim();
  const categorieChoisie = document.getElementById('filtreCategorieAdmin').value;

  const plats = toutLesPlats.filter((plat) => {
    const correspondNom = plat.nom.toLowerCase().includes(recherche);
    const correspondCategorie = !categorieChoisie || String(plat.categorie_id) === categorieChoisie;
    return correspondNom && correspondCategorie;
  });
  platsActuels = plats;

  const grille = document.getElementById('grillePlats');

  if (plats.length === 0) {
    grille.innerHTML = '<div class="vide">Aucun plat ne correspond.</div>';
    return;
  }

  grille.innerHTML = `<div class="grille-plats-admin">${plats.map((plat) => {
    const stockBas = plat.portions_restantes <= SEUIL_STOCK_BAS && plat.portions_restantes > 0;
    const rupture = plat.portions_restantes === 0;
    const urlPhoto = plat.photo_url || '';
    return `
      <div class="plat-carte-admin" onclick="ouvrirActionsPlat(${plat.id})">
        <div class="plat-image-zone-admin">
          ${urlPhoto ? `<img src="${urlPhoto}" alt="${plat.nom}">` : '🍽️'}
        </div>
        <div class="plat-carte-admin-corps">
          <h3>${plat.nom}</h3>
          <div class="prix-mini">${Number(plat.prix).toLocaleString('fr-FR')} FCFA</div>
          <div class="badges-mini">
            <span class="badge-mini ${plat.disponible ? 'dispo' : 'indispo'}">${plat.disponible ? 'Dispo' : 'Indispo'}</span>
            ${rupture || stockBas ? `<span class="badge-mini bas">${rupture ? 'Rupture' : 'Stock bas'}</span>` : ''}
            ${plat.mis_en_avant ? `<span class="badge-mini avant">★ Avant</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function ouvrirActionsPlat(id) {
  const plat = platsActuels.find((p) => p.id === id);
  if (!plat) return;

  document.getElementById('titreActionsPlat').textContent = plat.nom;
  document.getElementById('listeActionsPlat').innerHTML = `
    <button class="lien-action" style="text-align:left; padding:11px 14px;" onclick='ouvrirModifierPlat(${JSON.stringify(plat)}); fermerActionsPlat();'>Modifier le plat</button>
    <button class="lien-action" style="text-align:left; padding:11px 14px;" onclick="basculerMisEnAvant(${plat.id}, ${!plat.mis_en_avant}); fermerActionsPlat();">${plat.mis_en_avant ? 'Retirer de la mise en avant' : 'Mettre en avant'}</button>
    <button class="lien-action" style="text-align:left; padding:11px 14px;" onclick="reapprovisionner(${plat.id}, '${plat.nom.replace(/'/g, "\\'")}'); fermerActionsPlat();">Réapprovisionner</button>
    <button class="lien-action" style="text-align:left; padding:11px 14px;" onclick="basculerDisponibilite(${plat.id}, ${!plat.disponible}); fermerActionsPlat();">${plat.disponible ? 'Rendre indisponible' : 'Rendre disponible'}</button>
    <button class="lien-action danger" style="text-align:left; padding:11px 14px;" onclick="supprimerPlat(${plat.id}); fermerActionsPlat();">Supprimer le plat</button>
  `;
  document.getElementById('modaleActionsPlatFond').classList.add('actif');
}

function fermerActionsPlat() {
  document.getElementById('modaleActionsPlatFond').classList.remove('actif');
}

document.getElementById('boutonFermerActionsPlat').addEventListener('click', fermerActionsPlat);

async function reapprovisionner(id, nom) {
  const valeur = prompt('Nouvelle quantité de portions pour "' + nom + '" :');
  if (valeur === null) return;
  const nombre = Number(valeur);
  if (isNaN(nombre) || nombre < 0) {
    alert('Merci d\'entrer un nombre valide');
    return;
  }
  await fetch(API_URL + '/plats/' + id, {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({ portions_restantes: nombre, disponible: true })
  });
  chargerPlats();
}

async function basculerDisponibilite(id, nouvelleValeur) {
  await fetch(API_URL + '/plats/' + id, {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({ disponible: nouvelleValeur })
  });
  chargerPlats();
}

async function basculerMisEnAvant(id, nouvelleValeur) {
  await fetch(API_URL + '/plats/' + id, {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({ mis_en_avant: nouvelleValeur })
  });
  chargerPlats();
}

async function supprimerPlat(id) {
  if (!confirm('Supprimer ce plat ?')) return;
  await fetch(API_URL + '/plats/' + id, { method: 'DELETE', headers: enTetesAuth() });
  chargerPlats();
}

let platEnEdition = null;

document.getElementById('boutonAjouterPlat').addEventListener('click', () => {
  platEnEdition = null;
  document.getElementById('titreModalePlat').textContent = 'Ajouter un plat';
  document.getElementById('boutonSoumettrePlat').textContent = 'Créer';
  document.getElementById('formPlat').reset();
  document.getElementById('modalePlatFond').classList.add('actif');
});

function ouvrirModifierPlat(plat) {
  platEnEdition = plat.id;
  document.getElementById('titreModalePlat').textContent = 'Modifier le plat';
  document.getElementById('boutonSoumettrePlat').textContent = 'Enregistrer';
  document.getElementById('platNom').value = plat.nom;
  document.getElementById('platPrix').value = plat.prix;
  document.getElementById('platPortions').value = plat.portions_restantes;
  document.getElementById('platCategorie').value = plat.categorie_id || '';
  document.getElementById('platPhoto').value = '';
  document.getElementById('modalePlatFond').classList.add('actif');
}
document.getElementById('boutonAnnulerPlat').addEventListener('click', () => {
  document.getElementById('modalePlatFond').classList.remove('actif');
});
document.getElementById('formPlat').addEventListener('submit', async (e) => {
  e.preventDefault();

  const donneesPlat = {
    nom: document.getElementById('platNom').value,
    prix: Number(document.getElementById('platPrix').value),
    portions_restantes: Number(document.getElementById('platPortions').value),
    categorie_id: document.getElementById('platCategorie').value || null
  };

  let platId;

  if (platEnEdition) {
    const reponse = await fetch(API_URL + '/plats/' + platEnEdition, {
      method: 'PATCH',
      headers: enTetesAuth(),
      body: JSON.stringify(donneesPlat)
    });
    const plat = await reponse.json();
    platId = plat.id;
  } else {
    const reponse = await fetch(API_URL + '/plats', {
      method: 'POST',
      headers: enTetesAuth(),
      body: JSON.stringify(donneesPlat)
    });
    const plat = await reponse.json();
    platId = plat.id;
  }

  const fichierPhoto = document.getElementById('platPhoto').files[0];
  if (fichierPhoto) {
    const formData = new FormData();
    formData.append('photo', fichierPhoto);
    await fetch(API_URL + '/plats/' + platId + '/photo', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
  }

  document.getElementById('formPlat').reset();
  document.getElementById('modalePlatFond').classList.remove('actif');
  platEnEdition = null;
  chargerPlats();
});

// --- EMPLOYÉS ---
async function chargerEmployes() {
  const reponse = await fetch(API_URL + '/auth/utilisateurs', { headers: enTetesAuth() });
  const employes = await reponse.json();
  const grille = document.getElementById('grilleEmployes');

  grille.innerHTML = employes.map((employe) => `
    <div class="ticket">
      <div class="ticket-corps">
        <span class="pastille ${employe.actif ? 'dispo' : 'indispo'}">
          ${employe.actif ? 'Actif' : 'Désactivé'}
        </span>
        <h3>${employe.nom}</h3>
        <div class="stock">${employe.identifiant} — ${employe.role}</div>
        <div class="actions-ticket">
          ${employe.role !== 'admin' ? `
            <button class="lien-action" onclick="basculerActif(${employe.id}, ${!employe.actif})">
              ${employe.actif ? 'Désactiver' : 'Réactiver'}
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

async function basculerActif(id, nouvelleValeur) {
  await fetch(API_URL + '/auth/utilisateurs/' + id + '/statut', {
    method: 'PATCH',
    headers: enTetesAuth(),
    body: JSON.stringify({ actif: nouvelleValeur })
  });
  chargerEmployes();
}

document.getElementById('boutonAjouterEmploye').addEventListener('click', () => {
  document.getElementById('modaleEmployeFond').classList.add('actif');
});
document.getElementById('boutonAnnulerEmploye').addEventListener('click', () => {
  document.getElementById('modaleEmployeFond').classList.remove('actif');
});

document.getElementById('formEmploye').addEventListener('submit', async (e) => {
  e.preventDefault();
  const reponse = await fetch(API_URL + '/auth/utilisateurs', {
    method: 'POST',
    headers: enTetesAuth(),
    body: JSON.stringify({
      nom: document.getElementById('employeNom').value,
      identifiant: document.getElementById('employeIdentifiant').value,
      mot_de_passe: document.getElementById('employeMotDePasse').value,
      role: document.getElementById('employeRole').value
    })
  });
  if (reponse.ok) {
    document.getElementById('formEmploye').reset();
    document.getElementById('modaleEmployeFond').classList.remove('actif');
    chargerEmployes();
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
});

// --- TABLES ---
const BASE_URL_MENU = window.location.origin;

async function chargerTables() {
  const reponse = await fetch(API_URL + '/tables', { headers: enTetesAuth() });
  const tablesRestaurant = await reponse.json();
  const grille = document.getElementById('grilleTables');

  if (tablesRestaurant.length === 0) {
    grille.innerHTML = '<div class="vide">Aucune table pour le moment.</div>';
    return;
  }

  const nomRestaurant = localStorage.getItem('nomRestaurant') || 'Tablik';

  grille.innerHTML = tablesRestaurant.map((t) => {
    const lien = BASE_URL_MENU + '/menu.html?code=' + t.code_qr;
    const urlQr = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=1B2A41&bgcolor=F6F3EE&data=' + encodeURIComponent(lien);
    return `
      <div class="ticket">
        <div class="ticket-corps" style="text-align:center;">
          <div class="eyebrow">${nomRestaurant}</div>
          <img src="${urlQr}" width="160" height="160" style="margin: 12px auto; display:block;" alt="QR code table ${t.numero}">
          <h3>Table ${t.numero}</h3>
          <div class="actions-ticket" style="justify-content:center;">
            <button class="lien-action" onclick="telechargerTicketTable('${urlQr}', '${t.numero}', '${nomRestaurant}')">Télécharger</button>
            <button class="lien-action danger" onclick="supprimerTable(${t.id})">Supprimer</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function telechargerTicketTable(urlQr, numero, nomRestaurant) {
  const reponseImage = await fetch(urlQr);
  const blob = await reponseImage.blob();
  const urlBlob = URL.createObjectURL(blob);

  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 380;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#8C93A0';
    ctx.font = '600 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(nomRestaurant.toUpperCase(), canvas.width / 2, 34);

    ctx.drawImage(image, 50, 55, 200, 200);

    ctx.fillStyle = '#1B2A41';
    ctx.font = '600 24px Georgia';
    ctx.fillText('Table ' + numero, canvas.width / 2, 305);

    const lien = document.createElement('a');
    lien.download = 'table-' + numero + '.png';
    lien.href = canvas.toDataURL('image/png');
    lien.click();

    URL.revokeObjectURL(urlBlob);
  };
  image.src = urlBlob;
}

async function supprimerTable(id) {
  if (!confirm('Supprimer cette table ?')) return;
  await fetch(API_URL + '/tables/' + id, { method: 'DELETE', headers: enTetesAuth() });
  chargerTables();
}

document.getElementById('boutonAjouterTable').addEventListener('click', () => {
  document.getElementById('modaleTableFond').classList.add('actif');
});
document.getElementById('boutonAnnulerTable').addEventListener('click', () => {
  document.getElementById('modaleTableFond').classList.remove('actif');
});

document.getElementById('formTable').addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetch(API_URL + '/tables', {
    method: 'POST',
    headers: enTetesAuth(),
    body: JSON.stringify({ numero: document.getElementById('tableNumero').value })
  });
  document.getElementById('formTable').reset();
  document.getElementById('modaleTableFond').classList.remove('actif');
  chargerTables();
});

document.getElementById('boutonEnregistrerNom').addEventListener('click', () => {
  const valeur = document.getElementById('nomRestaurantInput').value.trim();
  if (valeur) {
    localStorage.setItem('nomRestaurant', valeur);
    chargerTables();
  }
});

document.getElementById('nomRestaurantInput').value = localStorage.getItem('nomRestaurant') || '';

// --- HISTORIQUE ---
async function chargerHistorique() {
  const dateChoisie = document.getElementById('dateHistorique').value;
  const reponse = await fetch(API_URL + '/commandes/historique?date=' + dateChoisie, { headers: enTetesAuth() });
  const donnees = await reponse.json();
  const conteneur = document.getElementById('listeHistorique');

  document.getElementById('totalJourHistorique').textContent =
    Number(donnees.totalJour).toLocaleString('fr-FR') + ' FCFA';

  const recapConteneur = document.getElementById('recapVentesHistorique');
  if (donnees.recapPlats.length === 0) {
    recapConteneur.innerHTML = '';
  } else {
    recapConteneur.innerHTML = donnees.recapPlats.map((p) => `
      <div class="recap-ligne">
        <span class="nom-plat">${p.nom}</span>
        <span class="quantite-plat">${p.quantite} vendu(s) — ${Number(p.montant).toLocaleString('fr-FR')} FCFA</span>
      </div>
    `).join('');
  }

  if (donnees.commandes.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune commande servie ce jour-là.</div>';
    return;
  }

  conteneur.innerHTML = donnees.commandes.map((commande) => `
    <div class="commande-carte historique">
      <div class="commande-info">
        <div class="numero">Table ${commande.numero_table} — #${commande.id}</div>
        <h3>${commande.lignes.length} plat(s)</h3>
        <ul>
          ${commande.lignes.map((l) => `<li>${l.quantite} × ${l.nom}</li>`).join('')}
        </ul>
        ${commande.note ? `<div style="background: rgba(224,152,42,0.12); color: var(--safran); font-size:12px; font-weight:600; padding:6px 9px; border-radius:6px; margin-bottom:8px;">📝 ${commande.note}</div>` : ''}
        <div class="total-ligne">${Number(commande.total).toLocaleString('fr-FR')} FCFA</div>
      </div>
    </div>
  `).join('');
}

document.getElementById('dateHistorique').addEventListener('change', chargerHistorique);

const aujourdHui = new Date().toISOString().slice(0, 10);
document.getElementById('dateHistorique').value = aujourdHui;

// --- ABONNEMENT ---
const LABELS_OPERATEUR = { mtn: 'MTN Mobile Money', moov: 'Moov Money', celtiis: 'Celtiis Cash' };
const LABELS_STATUT_DEMANDE = { en_attente: 'En attente', validee: 'Validée', refusee: 'Refusée' };

function formaterDate(dateIso) {
  return new Date(dateIso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

let parametresAbonnement = null;

async function chargerAbonnement() {
  const [reponseStatut, reponseParametres] = await Promise.all([
    fetch(API_URL + '/abonnement/statut', { headers: enTetesAuth() }),
    fetch(API_URL + '/abonnement/parametres', { headers: enTetesAuth() })
  ]);
  const restaurant = await reponseStatut.json();
  const parametres = await reponseParametres.json();
  parametresAbonnement = parametres;

  const carte = document.getElementById('carteStatutAbonnement');
  let contenuStatut = '';

  if (restaurant.statut === 'essai') {
    const joursRestants = Math.ceil((new Date(restaurant.date_fin_essai) - new Date()) / (1000 * 60 * 60 * 24));
    contenuStatut = `
      <span class="pastille ${joursRestants <= 2 ? 'indispo' : 'dispo'}">Essai gratuit</span>
      <h3 style="font-family:'Fraunces',serif; font-size:17px; margin:6px 0;">Il reste ${joursRestants > 0 ? joursRestants : 0} jour(s)</h3>
      <p style="font-size:13px; color:var(--ardoise);">Fin de l'essai le ${formaterDate(restaurant.date_fin_essai)}</p>
    `;
  } else if (restaurant.statut === 'actif') {
    contenuStatut = `
      <span class="pastille dispo">Actif</span>
      <h3 style="font-family:'Fraunces',serif; font-size:17px; margin:6px 0;">Abonnement en cours</h3>
      <p style="font-size:13px; color:var(--ardoise);">${restaurant.date_fin_abonnement ? 'Valide jusqu\'au ' + formaterDate(restaurant.date_fin_abonnement) : 'Date de fin non renseignée'}</p>
    `;
  } else {
    contenuStatut = `
      <span class="pastille indispo">Expiré</span>
      <h3 style="font-family:'Fraunces',serif; font-size:17px; margin:6px 0;">Votre abonnement a expiré</h3>
      <p style="font-size:13px; color:var(--ardoise);">Déclarez un paiement ci-dessous pour réactiver votre compte.</p>
    `;
  }

  contenuStatut += `
    <div style="margin-top:14px; padding-top:14px; border-top:1px solid #E4E1DA;">
      <p style="font-size:13px; margin-bottom:6px;"><strong>Montant mensuel : ${Number(parametres.montant_abonnement).toLocaleString('fr-FR')} FCFA</strong></p>
      ${parametres.numero_mtn ? `<p style="font-size:12.5px; color:var(--ardoise);">MTN : ${parametres.numero_mtn}</p>` : ''}
      ${parametres.numero_moov ? `<p style="font-size:12.5px; color:var(--ardoise);">Moov : ${parametres.numero_moov}</p>` : ''}
      ${parametres.numero_celtiis ? `<p style="font-size:12.5px; color:var(--ardoise);">Celtiis : ${parametres.numero_celtiis}</p>` : ''}
    </div>
  `;

  carte.innerHTML = contenuStatut;
  afficherNumeroSelonOperateur();
  afficherMontantCalcule();
}

function afficherNumeroSelonOperateur() {
  const operateur = document.getElementById('operateurPaiement').value;
  const zone = document.getElementById('numeroSelonOperateur');
  const numeros = {
    mtn: parametresAbonnement?.numero_mtn,
    moov: parametresAbonnement?.numero_moov,
    celtiis: parametresAbonnement?.numero_celtiis
  };
  const numero = numeros[operateur];

  if (numero) {
    zone.textContent = 'Envoyez à : ' + numero;
    zone.style.display = 'block';
  } else {
    zone.textContent = 'Numéro non renseigné pour cet opérateur, contactez le support.';
    zone.style.display = 'block';
  }
}
function afficherMontantCalcule() {
  const mois = Number(document.getElementById('nombreMoisPaiement').value);
  const zone = document.getElementById('montantCalcule');
  if (parametresAbonnement) {
    const total = mois * parametresAbonnement.montant_abonnement;
    zone.textContent = 'Montant à payer : ' + Number(total).toLocaleString('fr-FR') + ' FCFA';
  }
}

document.getElementById('nombreMoisPaiement').addEventListener('change', afficherMontantCalcule);

document.getElementById('operateurPaiement').addEventListener('change', afficherNumeroSelonOperateur);

async function chargerMesDemandes() {
  const reponse = await fetch(API_URL + '/abonnement/mes-demandes', { headers: enTetesAuth() });
  const demandes = await reponse.json();
  const conteneur = document.getElementById('listeMesDemandes');

  if (demandes.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune déclaration pour le moment.</div>';
    return;
  }

  conteneur.innerHTML = demandes.map((d) => `
    <div class="commande-carte">
      <div class="commande-info">
        <div class="numero">${formaterDate(d.date_creation)}</div>
        <h3>${LABELS_OPERATEUR[d.operateur]} — ${d.nombre_mois} mois — ${Number(d.montant).toLocaleString('fr-FR')} FCFA</h3>
        <div style="font-size:12.5px; color:var(--ardoise);">ID transaction : ${d.id_transaction}</div>
        ${d.raison_refus ? `<div style="font-size:12.5px; color:var(--piment); margin-top:4px;">Motif : ${d.raison_refus}</div>` : ''}
      </div>
      <span class="pastille ${d.statut === 'validee' ? 'dispo' : d.statut === 'refusee' ? 'indispo' : ''}" style="${d.statut === 'en_attente' ? 'background: rgba(224,152,42,0.12); color: var(--safran);' : ''}">
        ${LABELS_STATUT_DEMANDE[d.statut]}
      </span>
    </div>
  `).join('');
}

document.getElementById('formDemandePaiement').addEventListener('submit', async (e) => {
  e.preventDefault();
  const reponse = await fetch(API_URL + '/abonnement/demande', {
    method: 'POST',
    headers: enTetesAuth(),
    body: JSON.stringify({
      operateur: document.getElementById('operateurPaiement').value,
      id_transaction: document.getElementById('idTransactionPaiement').value,
      nombre_mois: Number(document.getElementById('nombreMoisPaiement').value)
    })
  });
  if (reponse.ok) {
    document.getElementById('formDemandePaiement').reset();
    chargerMesDemandes();
    alert('Votre déclaration a bien été envoyée. Elle sera vérifiée sous peu.');
  } else {
    const erreur = await reponse.json();
    alert(erreur.message);
  }
});

// --- TEMPS RÉEL ---
const socket = io(API_URL);
socket.on('connect', () => {
  socket.emit('rejoindre_restaurant', utilisateur.restaurant_id);
});
socket.on('nouvelle_commande', chargerCommandes);
socket.on('statut_commande_change', () => {
  chargerCommandes();
  const dateAffichee = document.getElementById('dateHistorique').value;
  if (dateAffichee === aujourdHui) {
    chargerHistorique();
  }
});

// Chargement initial
chargerCommandes();
chargerCategories();
chargerPlats();
chargerEmployes();
chargerTables();
chargerHistorique();
chargerAbonnement();
chargerMesDemandes();