# PWA integration

All files under `repo/` mirror your site repo paths. I could not see your current `service-worker.js` or `js/pwa-register.js`, so nothing here replaces them. You merge two small things by hand (steps 2 and 3).

## 1. Copy these files into the site repo
`manifest.webmanifest`, `offline.html`, `pwa.css`, `js/pwa-install.js`, `icons/*` (4 PNGs). Adjust paths if your CSS or JS folders differ.
The icons are placeholders (a green tile with a G). Put your logo in `tools/make-icons.py` or replace the PNGs, keeping the same names and sizes.

## 2. Add to the `<head>` of every page (and `pwa.css` + the script are CSP-safe, no inline code)
```html
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1b6b4a">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="stylesheet" href="/pwa.css">
<script src="/js/pwa-install.js" defer></script>
```
Your nav markup is repeated across about 14 pages, so this is a find-and-replace job. Keep `pwa-register.js` as it is.

## 3. Merge into your existing `service-worker.js` (do not replace it)
- Add `/offline.html` and `/pwa.css` to the precache list, and bump `CACHE_VERSION` (v3 to v4).
- In the fetch handler, for page navigations that fail on the network and are not in the cache, answer with `caches.match("/offline.html")`.
- Never cache API calls. At the top of the fetch handler: `if (new URL(request.url).pathname.startsWith("/.netlify/functions/")) return;`

## 4. `netlify.toml` headers
```toml
[[headers]]
  for = "/service-worker.js"
  [headers.values]
    Cache-Control = "no-cache"
[[headers]]
  for = "/manifest.webmanifest"
  [headers.values]
    Content-Type = "application/manifest+json"
```
If your CSP sets `manifest-src`, it must allow `'self'`.

## 5. Test it
Run `npm i -D jsdom && node --test tests/` (7 tests: manifest, CSP safety, install flow, snooze, iOS).
Then on the live site: Chrome DevTools > Application > Manifest shows no errors; Lighthouse "Installable" passes; install once on Android Chrome, once on desktop Chrome, and use Add to Home Screen on an iPhone.

## Phone and laptop
Progress, wallet link and certificates all live on the server behind the same login, so learners can start on a phone and continue on a laptop with no extra build. The banner covers both: Android and desktop Chrome and Edge get the install button, iOS Safari gets the manual steps.

## Important limit: wallets inside the installed app
An installed PWA on a phone cannot use a browser wallet, because wallet apps only inject themselves into their own built-in browsers. So lessons, progress and certificates work in the installed app, but claiming GRAD on a phone means opening the rewards page in MetaMask, Trust Wallet or Coinbase Wallet (the buttons on the rewards page do this). WalletConnect would fix this properly, so it is the next thing to build.
