if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      // Échec silencieux : l'appli continue de fonctionner normalement sans installation possible
    });
  });
}