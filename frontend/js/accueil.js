let scannerActif = null;

function ouvrirScanner() {
  document.getElementById('zoneScanner').classList.add('actif');

  scannerActif = new Html5Qrcode('lecteurQr');
  scannerActif.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 240 },
    (texteDecoded) => {
      fermerScanner();
      rediriger(texteDecoded);
    },
    () => {}
  ).catch(() => {
    alert('Impossible d\'accéder à la caméra. Vérifiez les autorisations de votre navigateur.');
    fermerScanner();
  });
}

function fermerScanner() {
  if (scannerActif) {
    scannerActif.stop().catch(() => {});
    scannerActif = null;
  }
  document.getElementById('zoneScanner').classList.remove('actif');
}

function rediriger(texteDecoded) {
  if (texteDecoded.includes('menu.html?code=')) {
    window.location.href = texteDecoded;
  } else {
    window.location.href = 'menu.html?code=' + encodeURIComponent(texteDecoded);
  }
}

document.getElementById('boutonScanner').addEventListener('click', ouvrirScanner);
document.getElementById('fermerScanner').addEventListener('click', fermerScanner);