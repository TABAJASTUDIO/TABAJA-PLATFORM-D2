(() => {
  'use strict';
  let deferredPrompt = null;
  const installButton = document.getElementById('installAppBtn');
  const updateToast = document.getElementById('pwaUpdateToast');
  const updateButton = document.getElementById('pwaUpdateBtn');
  const status = document.getElementById('pwaInstallStatus');
  const localNfcApp = window.location.port === '8766';

  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  document.documentElement.dataset.pwa = standalone ? 'installed' : 'browser';

  function setInstallState(text, enabled) {
    if (!installButton) return;
    installButton.textContent = text;
    installButton.disabled = !enabled;
    installButton.classList.toggle('pwa-ready', enabled);
  }

  if (standalone) {
    setInstallState('✓ App Installed', false);
    if (status) status.textContent = 'Running as installed app';
  } else {
    setInstallState('⬇ Install App', false);
    if (status) status.textContent = 'Preparing install…';
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    setInstallState('⬇ Install App', true);
    if (status) status.textContent = 'Ready to install';
  });

  installButton?.addEventListener('click', async () => {
    if (!deferredPrompt) {
      alert('Install is not ready yet. Refresh once, wait a few seconds, then try again. In Edge you can also use Menu (…) → Apps → Install Tabaja Card Designer.');
      return;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (choice.outcome === 'accepted') {
      setInstallState('✓ Installing…', false);
      if (status) status.textContent = 'Installation accepted';
    } else {
      setInstallState('⬇ Install App', false);
      if (status) status.textContent = 'Installation cancelled — refresh to try again';
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallState('✓ App Installed', false);
    if (status) status.textContent = 'Installed successfully';
  });

  if (localNfcApp && status) {
    status.textContent = standalone ? 'Local NFC PWA — hardware enabled' : 'Local NFC mode — ready to install';
  }

  const securePwaContext = window.isSecureContext || ['localhost','127.0.0.1'].includes(window.location.hostname);

  if ('serviceWorker' in navigator && securePwaContext) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
        if (status && !standalone) status.textContent = 'PWA active — waiting for install permission';

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller && updateToast) {
              updateToast.hidden = false;
            }
          });
        });

        updateButton?.addEventListener('click', () => {
          registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        });
      } catch (error) {
        console.error('PWA registration failed:', error);
        if (status) status.textContent = 'PWA registration failed';
      }
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
  } else if (status) {
    status.textContent = securePwaContext ? 'This browser does not support app installation' : 'LAN mobile mode — use browser menu → Add to Home screen';
  }
})();
