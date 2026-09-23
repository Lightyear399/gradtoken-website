// js/pwa-register.js
//
// Two independent jobs:
//   1. Register the service worker (makes offline/cache-shell work).
//   2. Capture the browser's install prompt and trigger it from our own
//      button, since Chrome/Edge don't reliably surface their own affordance
//      and Safari/iOS has no install API at all — those users still have to
//      use Share -> Add to Home Screen manually, which this can't change.

(function () {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        // Offline/caching is a nice-to-have, not load-bearing — a failed
        // registration shouldn't surface as an error to the user.
      });
    });
  }

  let deferredPrompt = null;
  const installBtn = document.getElementById("pwa-install-btn");

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (installBtn) installBtn.style.display = "";
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.style.display = "none";
    });
  }

  window.addEventListener("appinstalled", () => {
    if (installBtn) installBtn.style.display = "none";
    deferredPrompt = null;
  });
})();
