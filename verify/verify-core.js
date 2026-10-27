// Pure helpers for the public certificate page (no wallet or library needed). Checked against the real contract in test/verify.test.js.
(function (root) {
  "use strict";
  const TOKEN_URI = "0xc87b56dd"; // tokenURI(uint256)
  const TITLES = {
    "0xaa469ecc5afb78a222c237ec11ed5f1e732ac5b7436e0c9fb99173e335e204e0": "Solidity Basics",
    "0x255aeadacfce7edceb44dcb59d24de58e5ca06a4a93821e41126a0e6edd08eb7": "Intro to Blockchain",
    "0x181d56fa04326e88cbbf4aa448fbeafc49dc614183182764d4e176a9863c7315": "Excel and Business Communication",
    "0x67a340ad03282155e54afc0f3dc0b45befa5f6350c7edc1537963c9f2625bc6b": "Data Analytics",
    "0x3d70468bc01c4505a43821947a9c88b3819ceb0fa261bb1151936e5bf4ad44d3": "AI Literacy and Prompt Engineering",
    "0x543ce6c66a8b4f1a5e4648bd8e98fcfd663798297aac1b9760647bd6555e1d8c": "Web Development Basics",
    "0x4c61c1b125b5078c4e50ee5ac575b2c12a5d918f0ccdc48277af86dcbc6966d8": "Digital Marketing",
    "0xa2600f91da779dd7cdec69f4430cdbe43ecec43cfd06afc9fcb563d0a59ad4df": "Freelancing and Remote Work",
    "0x1eaa59ac5a6ebbe9bac6302738649ba4e571ba9aa77fc8c12dbaa759b0ea39e2": "Sales and Customer Success",
    "0xcd1c91ff5c25322b1ed33d0a3ffc7187162c550017093a8b3a3011c015769ed1": "Copywriting",
    "0x28598bf8c47c27611ed559141b9012a420278d97ec66a7f5b9184dd34ac0f983": "Short-Form Video and Content Creation",
    "0xcc9a79675dc9a1e68b6800223f9ba2a8ce5d3b88b9e7e13c0bc6e43567632532": "Graphic Design",
    "0x984f651a0891a52ac199ff82cb92def2d902541ac38742351ea1e02fbdb632c0": "Project Management and Agile",
    "0x0b77cd02a0c14880ada6b3b14e3d63f5d2072720cbb998583595db01a3df75a8": "Python",
    "0x4c2c3052adf4af9917e57fa7e4f4da2653238c3495557171787d15604ada89cd": "Cybersecurity Fundamentals",
    "0xa77c396a0dfb08837eb5d6b7197fc3abd6110cb324afb1686496e8097d21aace": "Community Management",
    "0x790260ade7af6b67ad4fbe8ae931d3ec9ff04bb4ad9ae9f170ea4620a3dd3c23": "QA and Software Testing",
    "0x8e83addc833a25e6f593b1c61ee83acdfd4af7c7fb51677cdc1abfbfec3efd40": "Technical Writing",
    "0x4dd82629b2d8abbeae6b0f6b4980d93ce95aedc211184772abc68caa26f4e39c": "UI/UX Design",
    "0x812f5ac839247726eff06870c0fe127d799d944fd6e165514650fcdaa565bf2f": "Bookkeeping and Basic Accounting"
  };
  const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const pad = (hex) => hex.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
  const V = {
    TITLES, isAddress,
    // The token id of a wallet's certificate is the wallet address itself.
    tokenUriCall: (addr) => TOKEN_URI + pad(addr),
    decodeString(hex) {
      const h = hex.replace(/^0x/i, "");
      const start = Number(BigInt("0x" + h.slice(0, 64))) * 2;
      const len = Number(BigInt("0x" + h.slice(start, start + 64)));
      const body = h.slice(start + 64, start + 64 + len * 2);
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
      return new TextDecoder().decode(bytes);
    },
    parseCertificate(dataUri) {
      const prefix = "data:application/json;base64,";
      if (!dataUri.startsWith(prefix)) throw new Error("Unexpected certificate format");
      const bin = atob(dataUri.slice(prefix.length));
      const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      return {
        total: json.total_courses,
        courses: (json.courses || []).map((c) => ({
          title: TITLES[c.courseId] || "Course " + c.courseId.slice(0, 10),
          issuedAt: Number(c.issuedAt), issuer: c.issuer, evidence: c.evidence,
        })),
      };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = V; else root.GradVerify = V;
})(typeof window !== "undefined" ? window : globalThis);
