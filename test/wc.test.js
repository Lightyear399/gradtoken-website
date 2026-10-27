const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const QRCode = require("qrcode");
const helpers = require("../learn/wc/src/helpers");

const learn = path.join(__dirname, "..", "learn");
const URI = "wc:7f6e504bfad60b485450578e05678ed3e8e8c4751d3c6160be17160d63ec90f9@2?relay-protocol=irn&symKey=587d5484ce2a2a6ee3ba1962fdd7e8588e06200c46823bd18fbd67def96ad303";
const dom0 = () => new JSDOM("<!doctype html><body></body>").window;

describe("WalletConnect support", () => {
  it("deep links carry the exact pairing uri", () => {
    const links = helpers.deepLinks(URI);
    expect(links.map((l) => l.name)).to.deep.equal(["MetaMask", "Trust Wallet", "Other wallet"]);
    for (const l of links.slice(0, 2)) expect(decodeURIComponent(l.href.split("uri=")[1])).to.equal(URI);
    expect(links[2].href).to.equal(URI);
  });

  it("QR is an SVG with one path square per dark module and no inline styles", () => {
    const w = dom0();
    const svg = helpers.qrSvg(w.document, URI);
    const { modules } = QRCode.create(URI, { errorCorrectionLevel: "M" });
    const dark = Array.from(modules.data).filter(Boolean).length;
    expect(svg.getAttribute("viewBox")).to.equal(`0 0 ${modules.size + 8} ${modules.size + 8}`);
    expect((svg.querySelector("path").getAttribute("d").match(/M/g) || []).length).to.equal(dark);
    expect(svg.outerHTML).to.not.match(/\sstyle=/);
  });

  it("the built bundle evaluates and exposes GradWC", () => {
    const w = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", url: "https://gradtoken.app/" }).window;
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; // real browsers have these; jsdom does not
    w.eval(fs.readFileSync(path.join(learn, "walletconnect.bundle.js"), "utf8"));
    expect(Object.keys(w.GradWC).sort()).to.deep.equal(["createWcProvider", "deepLinks", "qrSvg"]);
  });

  function pageDom() {
    const html = fs.readFileSync(path.join(learn, "rewards.html"), "utf8").replace(/<script[^>]*><\/script>/g, "");
    const w = new JSDOM(html, { runScripts: "outside-only", url: "https://gradtoken.app/learn/rewards.html", pretendToBeVisual: true }).window;
    w.TextEncoder = TextEncoder;
    return w;
  }
  const loadScripts = (w, projectId) => {
    w.eval(fs.readFileSync(path.join(learn, "..", "js", "gt-siwe.js"), "utf8"));
    w.eval(fs.readFileSync(path.join(learn, "abi.js"), "utf8"));
    let src = fs.readFileSync(path.join(learn, "rewards.js"), "utf8");
    if (projectId) src = src.replace("YOUR-REOWN-PROJECT-ID", projectId);
    w.eval(src);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  it("rewards page: connect with WalletConnect, sign in with the wallet, see courses", async () => {
    const w = pageDom();
    const acct = "0x" + "AB".repeat(20);
    const log = [];
    let signedIn = false;
    w.fetch = async (url, opts = {}) => {
      const u = String(url); log.push(u);
      const ok = (body) => ({ ok: true, status: 200, json: async () => body });
      if (u.endsWith("auth-me")) return ok({ address: signedIn ? acct.toLowerCase() : null });
      if (u.includes("auth-nonce")) return ok({ message: "sign in please\nNonce: abc" });
      if (u.endsWith("auth-verify")) { signedIn = true; expect(JSON.parse(opts.body).address).to.equal(acct); return ok({ ok: true, address: acct.toLowerCase() }); }
      if (u.endsWith("my-status")) return ok({ wallet: acct.toLowerCase(), courses: [{ course: "solidity-basics", title: "Solidity Basics", courseId: "0x" + "00".repeat(32), passed: false, certified: false }] });
      return ok({ code: "ABC123XY", stats: { registered: 0, qualified: 0, paid: 0, underReview: 0 } });
    };
    let onUri, signed = null;
    w.GradWC = {
      deepLinks: helpers.deepLinks, qrSvg: helpers.qrSvg,
      createWcProvider: async ({ projectId, chainId, onUri: cb }) => {
        expect(projectId).to.match(/^[0-9a-f]{32}$/); expect(chainId).to.equal(84532);
        onUri = cb;
        return {
          accounts: [acct], session: null, on: () => {},
          connect: async () => { onUri(URI); await wait(20); return null; },
          request: async ({ method, params }) => {
            if (method === "eth_chainId") return "0x14a34";
            if (method === "personal_sign") { signed = params; return "0x" + "11".repeat(65); }
            return "0x0";
          },
        };
      },
    };
    loadScripts(w, "0123456789abcdef0123456789abcdef");
    await wait(60);

    const btn = [...w.document.querySelectorAll("#wallet button")].find((b) => /WalletConnect/.test(b.textContent));
    expect(btn, "WalletConnect button").to.exist;
    btn.click();
    await wait(10);
    const panel = w.document.getElementById("wcpanel");
    expect(panel.hidden).to.equal(false);
    expect(panel.querySelector("svg")).to.exist;
    expect(panel.querySelectorAll("a")).to.have.length(3);

    await wait(120);
    const walletText = () => w.document.getElementById("wallet").textContent;
    expect(walletText()).to.contain("Connected");
    expect(walletText()).to.contain("Sign in");
    expect(walletText()).to.contain("Disconnect");

    [...w.document.querySelectorAll("#wallet button")].find((b) => b.textContent === "Sign in").click();
    await wait(150);
    expect(signed[1]).to.equal(acct);                                  // the connected wallet signed
    expect(Buffer.from(signed[0].slice(2), "hex").toString()).to.contain("sign in please");
    expect(walletText()).to.contain("Signed in");
    expect(w.document.getElementById("courses").textContent).to.contain("Solidity Basics");
    expect(log.some((u) => u.includes("link-wallet"))).to.equal(false);
  });

  it("the WalletConnect button stays hidden until a real project id is set", async () => {
    const w = pageDom();
    w.fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).endsWith("auth-me") ? { address: null } : {}) });
    loadScripts(w, null);
    await wait(60);
    expect(w.document.getElementById("wallet").textContent).to.not.contain("WalletConnect");
    expect(w.document.getElementById("wallet").textContent).to.contain("Open this page in a wallet app");
  });
});
