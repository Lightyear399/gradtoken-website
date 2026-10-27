// Pure helpers (also imported by tests). No inline styles or CSS: everything is SVG attributes and DOM nodes.
const QRCode = require("qrcode");

// Wallet deep links for opening a WalletConnect pairing URI on the same phone.
function deepLinks(uri) {
  const u = encodeURIComponent(uri);
  return [
    { name: "MetaMask", href: "https://metamask.app.link/wc?uri=" + u },
    { name: "Trust Wallet", href: "https://link.trustwallet.com/wc?uri=" + u },
    { name: "Other wallet", href: uri }, // the wc: scheme opens whichever installed wallet registered it
  ];
}

// Builds the QR as one SVG path (a unit square per dark module), always black on white so any wallet camera can read it.
function qrSvg(doc, text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size, pad = 4, total = n + pad * 2, NS = "http://www.w3.org/2000/svg";
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (modules.data[y * n + x]) d += `M${x + pad} ${y + pad}h1v1h-1z`;
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${total} ${total}`);
  svg.setAttribute("width", "240"); svg.setAttribute("height", "240");
  svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "WalletConnect QR code");
  const bg = doc.createElementNS(NS, "rect");
  bg.setAttribute("width", String(total)); bg.setAttribute("height", String(total)); bg.setAttribute("fill", "#ffffff");
  const path = doc.createElementNS(NS, "path");
  path.setAttribute("d", d); path.setAttribute("fill", "#000000");
  svg.append(bg, path);
  return svg;
}
module.exports = { deepLinks, qrSvg };
