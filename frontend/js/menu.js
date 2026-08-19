const API_URL = window.location.origin;
const parametres = new URLSearchParams(window.location.search);
const codeQr = parametres.get('code');
const CLE_COMMANDES = 'commandesActives_' + codeQr;

let table = null;
let restaurantId = null;
let plats = [];
const panier = {};
let categoriesClient = [];
let categorieChoisieClient = '';
let rechercheClient = '';
let socket = null;

function getCommandesActives() {
  try {
    return JSON.parse(localStorage.getItem(CLE_COMMANDES)) || [];
  } catch {
    return [];
  }
}

function ajouterCommandeActive(id) {
  const liste = getCommandesActives();
  if (!liste.includes(id)) liste.push(id);
  localStorage.setItem(CLE_COMMANDES, JSON.stringify(liste));
}

function retirerCommandeActive(id) {
  const liste = getCommandesActives().filter((c) => c !== id);
  localStorage.setItem(CLE_COMMANDES, JSON.stringify(liste));
}

async function initialiser() {
  if (!codeQr) {
    document.getElementById('zonePrincipale').innerHTML = '<div class="erreur">Aucune table détectée. Scannez le QR code sur votre table.</div>';
    return;
  }

  try {
    const reponseTable = await fetch(API_URL + '/tables/code/' + codeQr);
    if (!reponseTable.ok) {
      document.getElementById('zonePrincipale').innerHTML = '<div class="erreur">Table introuvable. Vérifiez le QR code.</div>';
      return;
    }
    table = await reponseTable.json();
    restaurantId = table.restaurant_id;
    document.getElementById('titreTable').textContent = 'Table ' + table.numero;

    const reponseCategories = await fetch(API_URL + '/categories?restaurant_id=' + restaurantId);
    categoriesClient = await reponseCategories.json();
    afficherFiltresCategories();

    const reponsePlats = await fetch(API_URL + '/plats/disponibles?restaurant_id=' + restaurantId);
    plats = await reponsePlats.json();
    afficherMenu();

    socket = io(API_URL);
    socket.on('connect', () => {
      socket.emit('rejoindre_restaurant', restaurantId);
    });
    socket.on('menu_mis_a_jour', rafraichirMenu);
    socket.on('statut_commande_change', () => {
      mettreAJourBadge();
      if (document.getElementById('ecranSuivi').classList.contains('actif')) {
        afficherEcranSuivi();
      }
    });

    mettreAJourBadge();

  } catch (erreur) {
    document.getElementById('zonePrincipale').innerHTML = '<div class="erreur">Impossible de contacter le serveur.</div>';
  }
}

function afficherFiltresCategories() {
  const conteneur = document.getElementById('filtresCategoriesClient');
  const tags = [{ id: '', nom: 'Tout' }, ...categoriesClient];

  conteneur.innerHTML = tags.map((cat) => `
    <button class="pastille-categorie ${categorieChoisieClient === String(cat.id) ? 'actif' : ''}"
      onclick="choisirCategorieClient('${cat.id}')">${cat.nom}</button>
  `).join('');
}

function choisirCategorieClient(id) {
  categorieChoisieClient = id;
  afficherFiltresCategories();
  afficherMenu();
}

document.getElementById('rechercheMenuClient').addEventListener('input', (e) => {
  rechercheClient = e.target.value.toLowerCase().trim();
  afficherMenu();
});

async function rafraichirMenu() {
  const reponsePlats = await fetch(API_URL + '/plats/disponibles?restaurant_id=' + restaurantId);
  plats = await reponsePlats.json();

  Object.keys(panier).forEach((id) => {
    const plat = plats.find((p) => p.id === Number(id));
    if (!plat) {
      delete panier[id];
    } else if (panier[id] > plat.portions_restantes) {
      panier[id] = plat.portions_restantes;
      if (panier[id] === 0) delete panier[id];
    }
  });

  afficherMenu();
  Object.keys(panier).forEach((id) => {
    const span = document.getElementById('qte-' + id);
    if (span) span.textContent = panier[id];
  });
  mettreAJourBarrePanier();
}

function afficherMenu() {
  const zone = document.getElementById('zonePrincipale');

  const platsFiltres = plats.filter((plat) => {
    const correspondNom = plat.nom.toLowerCase().includes(rechercheClient);
    const correspondCategorie = !categorieChoisieClient || String(plat.categorie_id) === categorieChoisieClient;
    return correspondNom && correspondCategorie;
  });

  if (platsFiltres.length === 0) {
    zone.innerHTML = '<div class="vide">Aucun plat disponible pour le moment.</div>';
    return;
  }

  zone.innerHTML = `<div class="grille-plats-client">${platsFiltres.map((plat) => {
    const urlPhoto = plat.photo_url || '';
    const quantite = panier[plat.id] || 0;
    return `
      <div class="plat-carte">
        <div class="plat-image-zone ${urlPhoto ? '' : 'sans-photo'}">
          ${urlPhoto
            ? `<img src="${urlPhoto}" onclick="ouvrirPhoto('${urlPhoto}')" alt="${plat.nom}">`
            : '🍽️'}
          ${plat.mis_en_avant ? '<span class="badge-avant-carte">★ Plat du jour</span>' : ''}
        </div>
        <div class="plat-carte-corps">
          <h3>${plat.nom}</h3>
          <div class="plat-prix">${Number(plat.prix).toLocaleString('fr-FR')} FCFA</div>
          <div class="plat-carte-bas">
            ${quantite === 0
              ? `<button class="bouton-plus-carte" onclick="modifierQuantite(${plat.id}, 1)">+</button>`
              : `<div class="stepper-mini">
                   <button onclick="modifierQuantite(${plat.id}, -1)">−</button>
                   <span id="qte-${plat.id}">${quantite}</span>
                   <button onclick="modifierQuantite(${plat.id}, 1)">+</button>
                 </div>`
            }
          </div>
        </div>
      </div>
    `;
  }).join('')}</div>`;
  mettreAJourBarrePanier();
}

function ouvrirPhoto(url) {
  document.getElementById('modalePhotoImage').src = url;
  document.getElementById('modalePhotoFond').classList.add('actif');
}

function fermerPhoto(event) {
  if (event) event.stopPropagation();
  document.getElementById('modalePhotoFond').classList.remove('actif');
}

function modifierQuantite(platId, delta) {
  const plat = plats.find((p) => p.id === platId);
  const actuel = panier[platId] || 0;
  const nouveau = Math.max(0, Math.min(plat.portions_restantes, actuel + delta));
  if (nouveau === 0) {
    delete panier[platId];
  } else {
    panier[platId] = nouveau;
  }
  afficherMenu();
}

function mettreAJourBarrePanier() {
  const ids = Object.keys(panier);
  const barre = document.getElementById('barrePanier');

  if (ids.length === 0) {
    barre.classList.remove('actif');
    return;
  }

  let total = 0;
  ids.forEach((id) => {
    const plat = plats.find((p) => p.id === Number(id));
    if (plat) total += plat.prix * panier[id];
  });

  document.getElementById('totalPanier').textContent = Number(total).toLocaleString('fr-FR') + ' FCFA';
  barre.classList.add('actif');
}

document.getElementById('boutonCommander').addEventListener('click', async () => {
  const bouton = document.getElementById('boutonCommander');
  if (bouton.disabled) return;
  bouton.disabled = true;
  bouton.textContent = 'Envoi...';

  const lignes = Object.entries(panier).map(([plat_id, quantite]) => ({
    plat_id: Number(plat_id),
    quantite
  }));
  const note = document.getElementById('noteCommande').value.trim();

  try {
    const reponse = await fetch(API_URL + '/commandes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_id: table.id, lignes, note })
    });
    const donnees = await reponse.json();

    if (!reponse.ok) {
      alert(donnees.message || 'Erreur lors de la commande');
      bouton.disabled = false;
      bouton.textContent = 'Commander';
      rafraichirMenu();
      return;
    }

    ajouterCommandeActive(donnees.id);
    Object.keys(panier).forEach((id) => delete panier[id]);
    document.getElementById('noteCommande').value = '';
    mettreAJourBarrePanier();
    rafraichirMenu();
    afficherEcranSuivi();

  } catch (erreur) {
    alert('Impossible de contacter le serveur');
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Commander';
  }
});

// --- ÉCRAN "MES COMMANDES" ---

function mettreAJourBadge() {
  const actives = getCommandesActives();
  const bouton = document.getElementById('boutonMesCommandes');
  const badge = document.getElementById('badgeCommandes');

  if (actives.length === 0) {
    bouton.classList.remove('visible');
    return;
  }
  bouton.classList.add('visible');
  badge.textContent = actives.length;
}

async function afficherEcranSuivi() {
  document.getElementById('zonePrincipale').style.display = 'none';
  document.getElementById('barrePanier').classList.remove('actif');
  document.getElementById('ecranSuivi').classList.add('actif');

  const actives = getCommandesActives();
  const conteneur = document.getElementById('listeSuivi');

  if (actives.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune commande en cours sur cet appareil.</div>';
    return;
  }

  const ordre = ['nouvelle', 'en_preparation', 'prete', 'servie'];
  const labels = { nouvelle: 'Reçue', en_preparation: 'Préparation', prete: 'Prête', servie: 'Servie' };

  const resultats = await Promise.all(actives.map(async (id) => {
    const reponse = await fetch(API_URL + '/commandes/' + id + '/statut-actuel');
    if (!reponse.ok) {
      retirerCommandeActive(id);
      return null;
    }
    return reponse.json();
  }));

  const commandesValides = resultats.filter((c) => c !== null);

  commandesValides.forEach((c) => {
    if (c.statut === 'servie') retirerCommandeActive(c.id);
  });

  if (commandesValides.length === 0) {
    conteneur.innerHTML = '<div class="vide">Aucune commande en cours sur cet appareil.</div>';
    mettreAJourBadge();
    return;
  }

  conteneur.innerHTML = commandesValides.map((c) => {
    const indexActuel = ordre.indexOf(c.statut);
    return `
      <div class="commande-suivi">
        <div class="numero">Table ${c.numero_table} — #${c.id}</div>
        <ul>${c.lignes.map((l) => `<li>${l.quantite} × ${l.nom}</li>`).join('')}</ul>
        <div class="etapes-mini">
          ${ordre.map((statut, i) => `
            <div class="etape-mini ${i < indexActuel ? 'atteinte' : ''} ${i === indexActuel ? 'en_cours' : ''}">
              ${labels[statut]}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  mettreAJourBadge();
}

document.getElementById('boutonMesCommandes').addEventListener('click', afficherEcranSuivi);

document.getElementById('boutonRetourMenu').addEventListener('click', () => {
  document.getElementById('ecranSuivi').classList.remove('actif');
  document.getElementById('zonePrincipale').style.display = 'block';
  rafraichirMenu();
});

document.getElementById('flecheCategorieGauche').addEventListener('click', () => {
  document.getElementById('filtresCategoriesClient').scrollBy({ left: -150, behavior: 'smooth' });
});
document.getElementById('flecheCategorieDroite').addEventListener('click', () => {
  document.getElementById('filtresCategoriesClient').scrollBy({ left: 150, behavior: 'smooth' });
});

initialiser();