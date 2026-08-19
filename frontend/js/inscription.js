const API_URL = window.location.origin;
const CLE_DEJA_INSCRIT = 'restaurant_deja_inscrit';

const parametresUrl = new URLSearchParams(window.location.search);
const codeParrain = parametresUrl.get('parrain');

// Configuration des pays : ajuste "chiffres" ou "prefixe" si un format ne correspond pas à la réalité du pays
const PAYS = [
  { indicatif: '229', drapeau: '🇧🇯', nom: 'Bénin', chiffres: 10, prefixe: '01' },
  { indicatif: '228', drapeau: '🇹🇬', nom: 'Togo', chiffres: 8 },
  { indicatif: '221', drapeau: '🇸🇳', nom: 'Sénégal', chiffres: 9 },
  { indicatif: '225', drapeau: '🇨🇮', nom: "Côte d'Ivoire", chiffres: 10 },
  { indicatif: '226', drapeau: '🇧🇫', nom: 'Burkina Faso', chiffres: 8 },
  { indicatif: '223', drapeau: '🇲🇱', nom: 'Mali', chiffres: 8 },
  { indicatif: '227', drapeau: '🇳🇪', nom: 'Niger', chiffres: 8 },
  { indicatif: '224', drapeau: '🇬🇳', nom: 'Guinée', chiffres: 9 }
];

const selectPays = document.getElementById('indicatifPays');
selectPays.innerHTML = PAYS.map((p) =>
  `<option value="${p.indicatif}">${p.drapeau} +${p.indicatif}</option>`
).join('');

if (localStorage.getItem(CLE_DEJA_INSCRIT)) {
  document.getElementById('zoneFormulaire').style.display = 'none';
  document.getElementById('zoneDejaInscrit').style.display = 'block';
}

document.getElementById('telephone').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '');
});

function validerTelephone() {
  const pays = PAYS.find((p) => p.indicatif === selectPays.value);
  const numero = document.getElementById('telephone').value;
  const erreurDiv = document.getElementById('erreurTelephone');

  if (numero.length !== pays.chiffres) {
    erreurDiv.textContent = `Le numéro pour ${pays.nom} doit contenir ${pays.chiffres} chiffres`;
    return null;
  }
  if (pays.prefixe && !numero.startsWith(pays.prefixe)) {
    erreurDiv.textContent = `Le numéro pour ${pays.nom} doit commencer par ${pays.prefixe}`;
    return null;
  }
  erreurDiv.textContent = '';
  return '+' + pays.indicatif + numero;
}

document.getElementById('formInscription').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bouton = document.getElementById('boutonInscription');
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = '';

  const telephoneComplet = validerTelephone();
  if (!telephoneComplet) return;

  bouton.disabled = true;
  bouton.textContent = 'Création en cours...';

  const donnees = {
    nom_restaurant: document.getElementById('nomRestaurant').value.trim(),
    nom_admin: document.getElementById('nomAdmin').value.trim(),
    telephone: telephoneComplet,
    identifiant: document.getElementById('identifiant').value.trim(),
    mot_de_passe: document.getElementById('motDePasse').value,
    code_parrain: codeParrain
  };

  try {
    const reponse = await fetch(API_URL + '/auth/inscription-restaurant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(donnees)
    });
    const resultat = await reponse.json();

    if (!reponse.ok) {
      messageDiv.textContent = resultat.message || 'Erreur lors de la création';
      bouton.disabled = false;
      bouton.textContent = 'Créer mon restaurant';
      return;
    }

    localStorage.setItem(CLE_DEJA_INSCRIT, 'true');
    localStorage.setItem('token', resultat.token);
    localStorage.setItem('utilisateur', JSON.stringify(resultat.utilisateur));

    window.location.href = 'admin.html';

  } catch (erreur) {
    messageDiv.textContent = 'Impossible de contacter le serveur';
    bouton.disabled = false;
    bouton.textContent = 'Créer mon restaurant';
  }
});