const API_URL = window.location.origin;

document.getElementById('formConnexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  const identifiant = document.getElementById('identifiant').value;
  const motDePasse = document.getElementById('motDePasse').value;
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = '';

  try {
    const reponse = await fetch(API_URL + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiant, mot_de_passe: motDePasse })
    });

    const donnees = await reponse.json();

    if (!reponse.ok) {
      messageDiv.textContent = donnees.message || 'Erreur de connexion';
      return;
    }

    localStorage.setItem('token', donnees.token);
    localStorage.setItem('utilisateur', JSON.stringify(donnees.utilisateur));

    if (donnees.utilisateur.doit_changer_mot_de_passe) {
      window.location.href = 'changer-mot-de-passe.html';
      return;
    }

    if (donnees.utilisateur.role === 'super_admin') {
      window.location.href = 'super-admin.html';
    } else if (donnees.utilisateur.role === 'parrain') {
      window.location.href = 'parrain.html';
    } else if (donnees.utilisateur.role === 'admin') {
      window.location.href = 'admin.html';
    } else if (donnees.utilisateur.role === 'cuisinier') {
      window.location.href = 'cuisine.html';
    } else if (donnees.utilisateur.role === 'serveur') {
      window.location.href = 'service.html';
    }

  } catch (erreur) {
    messageDiv.textContent = 'Impossible de contacter le serveur';
  }
});