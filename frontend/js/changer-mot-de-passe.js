const API_URL = window.location.origin;
const token = localStorage.getItem('token');
const utilisateur = JSON.parse(localStorage.getItem('utilisateur') || 'null');

if (!token || !utilisateur) {
  window.location.href = 'connexion.html';
}

document.getElementById('formChangement').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ancien = document.getElementById('ancienMotDePasse').value;
  const nouveau = document.getElementById('nouveauMotDePasse').value;
  const confirmation = document.getElementById('confirmationMotDePasse').value;
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = '';

  if (nouveau !== confirmation) {
    messageDiv.textContent = 'Les deux mots de passe ne correspondent pas';
    return;
  }

  try {
    const reponse = await fetch(API_URL + '/auth/changer-mot-de-passe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ ancien_mot_de_passe: ancien, nouveau_mot_de_passe: nouveau })
    });
    const donnees = await reponse.json();

    if (!reponse.ok) {
      messageDiv.textContent = donnees.message || 'Erreur lors du changement';
      return;
    }

    utilisateur.doit_changer_mot_de_passe = false;
    localStorage.setItem('utilisateur', JSON.stringify(utilisateur));

    if (utilisateur.role === 'admin') {
      window.location.href = 'admin.html';
    } else if (utilisateur.role === 'cuisinier') {
      window.location.href = 'cuisine.html';
    } else if (utilisateur.role === 'serveur') {
      window.location.href = 'service.html';
    }

  } catch (erreur) {
    messageDiv.textContent = 'Impossible de contacter le serveur';
  }
});