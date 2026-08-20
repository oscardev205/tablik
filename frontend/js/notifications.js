(function () {
  const conteneurToasts = document.createElement('div');
  conteneurToasts.id = 'zoneToasts';
  document.body.appendChild(conteneurToasts);

  window.afficherToast = function (titre, corps) {
    const toast = document.createElement('div');
    toast.className = 'toast-notif';
    toast.innerHTML = `<span>🔔</span><span><strong>${titre}</strong>${corps ? ' — ' + corps : ''}</span>`;
    conteneurToasts.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  };

  window.notifier = function (titre, corps, url) {
    afficherToast(titre, corps);

    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) {
      return;
    }

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'AFFICHER_NOTIFICATION',
        titre,
        corps,
        url: url || window.location.pathname
      });
    } else {
      try {
        new Notification(titre, { body: corps || '', icon: 'icons/icon-192.png' });
      } catch (e) {}
    }
  };

  if ('Notification' in window && Notification.permission === 'default') {
    const bouton = document.createElement('button');
    bouton.className = 'bouton-activer-notif';
    bouton.textContent = '🔔 Activer les notifications';
    bouton.onclick = () => {
      Notification.requestPermission().then(() => bouton.remove());
    };
    document.body.appendChild(bouton);
  }
})();