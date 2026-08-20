(function () {
    const API_URL_BLOCAGE = window.location.origin;
  const token = localStorage.getItem('token');
  const utilisateur = JSON.parse(localStorage.getItem('utilisateur') || 'null');
  if (!token || !utilisateur || !utilisateur.restaurant_id) return;

  const estAdmin = utilisateur.role === 'admin';
  const surPageAdmin = !!document.getElementById('panneauAbonnement');

  const overlay = document.createElement('div');
  overlay.id = 'overlayAbonnement';
  overlay.className = 'overlay-abonnement';
  overlay.innerHTML = `
    <div class="carte-blocage">
      <div class="eyebrow">Tablik</div>
      <h2 id="titreBlocage"></h2>
      <p id="texteBlocage"></p>
      <button id="boutonBlocageAction" style="display:none;"></button>
    </div>
  `;
  document.body.appendChild(overlay);

  let ongletActuelAdmin = surPageAdmin
    ? (document.querySelector('.onglet.actif')?.dataset.panneau || 'panneauCommandes')
    : null;

  if (surPageAdmin) {
    document.querySelectorAll('.onglet').forEach((onglet) => {
      onglet.addEventListener('click', () => {
        ongletActuelAdmin = onglet.dataset.panneau;
        afficherSelonEtat();
      });
    });
  }

  let dernierStatut = null;
  let derniereDemandeEnAttente = false;

  function afficherSelonEtat() {
    if (dernierStatut === null) return;

if (dernierStatut !== 'expire') {
      overlay.classList.remove('actif');
      return;
    }
    if (surPageAdmin && ongletActuelAdmin === 'panneauAbonnement') {
      overlay.classList.remove('actif');
      return;
    }

    overlay.classList.add('actif');

    const titre = document.getElementById('titreBlocage');
    const texte = document.getElementById('texteBlocage');
    const bouton = document.getElementById('boutonBlocageAction');

    if (!estAdmin) {
      titre.textContent = 'Accès suspendu';
      texte.textContent = 'Veuillez contacter votre responsable pour réactiver l\'accès.';
      bouton.style.display = 'none';
      return;
    }

    if (derniereDemandeEnAttente) {
      titre.textContent = 'Paiement en cours de vérification';
      texte.textContent = 'Votre déclaration de paiement est en cours de traitement, merci de patienter.';
      bouton.style.display = 'none';
    } else {
      titre.textContent = 'Abonnement expiré';
      texte.textContent = 'Votre période d\'essai ou votre abonnement est arrivé à échéance.';
      bouton.textContent = 'Aller à Mon abonnement';
      bouton.style.display = 'inline-block';
      bouton.onclick = () => {
        if (surPageAdmin) {
          document.querySelector('.onglet[data-panneau="panneauAbonnement"]').click();
        } else {
          window.location.href = 'admin.html';
        }
      };
    }
  }

  async function verifierStatutAcces() {
    try {
      const reponse = await fetch(API_URL_BLOCAGE + '/abonnement/statut-acces', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const donnees = await reponse.json();
      dernierStatut = donnees.statut;
      derniereDemandeEnAttente = donnees.demande_en_attente;
      afficherSelonEtat();
    } catch (erreur) {
      // en cas de souci réseau ponctuel, on ne bloque pas l'utilisateur
    }
  }

  verifierStatutAcces();

  const socketBlocage = io(API_URL_BLOCAGE);
  socketBlocage.on('connect', () => {
    socketBlocage.emit('rejoindre_restaurant', utilisateur.restaurant_id);
  });
  socketBlocage.on('abonnement_valide', verifierStatutAcces);
socketBlocage.on('abonnement_refuse', verifierStatutAcces);
})();