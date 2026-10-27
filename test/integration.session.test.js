// Runs only inside your site repo, where netlify/functions/_shared/session.js exists.
// Proves the new functions accept a REAL session cookie made by your own sign-in code.
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const shared = path.join(__dirname, "..", "netlify", "functions", "_shared", "session.js");
const describeHere = fs.existsSync(shared) ? describe : describe.skip;

describeHere("integration with your wallet session code", () => {
  it("a cookie issued by your session.js signs the user in; ADMIN_WALLETS makes an admin", () => {
    process.env.SESSION_SECRET = "x".repeat(40);
    const { issueSessionCookie, getSessionAddress } = require(shared);
    const { authFromEvent } = require("../netlify/functions/_lib/wallet-auth");
    const addr = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
    const cookie = issueSessionCookie(addr).split(";")[0];            // gt_session=<jwt>
    const event = { headers: { cookie } };
    const user = authFromEvent(event, { getSessionAddress, adminWallets: "" });
    expect(user.id).to.equal(addr.toLowerCase());
    expect(authFromEvent(event, { getSessionAddress, adminWallets: addr.toLowerCase() }).app_metadata.role).to.equal("admin");
    expect(() => authFromEvent({ headers: {} }, { getSessionAddress, adminWallets: "" })).to.throw("Not signed in");
  });

  it("realDeps wires your Supabase client and session helper (no network needed)", () => {
    Object.assign(process.env, {
      SESSION_SECRET: "x".repeat(40), SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc",
      BASE_CHAIN_ID: "84532", BASE_RPC_URL: "http://127.0.0.1:1", REWARDS_ADDRESS: "0x" + "11".repeat(20), CERTIFICATE_ADDRESS: "0x" + "22".repeat(20),
      VOUCHER_SIGNER_KEY: "0x" + "01".repeat(32), CERTIFICATE_MINTER_KEY: "0x" + "02".repeat(32), ADMIN_WALLETS: "",
    });
    const { realDeps } = require("../netlify/functions/_lib/deps");
    const deps = realDeps();
    expect(deps.chain.chainId).to.equal(84532);
    expect(deps.db.getWallet).to.be.a("function");
    expect(deps.signer.address).to.match(/^0x[0-9a-fA-F]{40}$/);
    return deps.auth({ headers: {} }).then(() => { throw new Error("should reject"); }, (e) => expect(e.message).to.equal("Not signed in"));
  });
});
