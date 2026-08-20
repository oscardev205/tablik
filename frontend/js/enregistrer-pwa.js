if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

let evenementInstallation = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  evenementInstallation = e;
  const bouton = document.getElementById('boutonInstallerApp');
  if (bouton) bouton.style.display = 'inline-block';
});

function declencherInstallation() {
  if (evenementInstallation) {
    evenementInstallation.prompt();
    evenementInstallation.userChoice.then(() => {
      evenementInstallation = null;
      const bouton = document.getElementById('boutonInstallerApp');
      if (bouton) bouton.style.display = 'none';
    });
  } else {
    alert('Pour installer : ouvrez le menu de votre navigateur (⋮ ou ☰) puis "Ajouter à l\'écran d\'accueil" ou "Installer l\'application".');
  }
}

window.addEventListener('appinstalled', () => {
  const bouton = document.getElementById('boutonInstallerApp');
  if (bouton) bouton.style.display = 'none';
});