const { expect } = require("chai");
const { ethers } = require("hardhat");
const { authFromEvent, parseAdmins } = require("../netlify/functions/_lib/wallet-auth");
const siwe = require("../js/gt-siwe");

describe("wallet sign-in adapter", () => {
  const ADDR = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
  const session = (a) => () => a;

  it("rejects requests without a wallet session", () => {
    expect(() => authFromEvent({}, { getSessionAddress: session(null), adminWallets: "" })).to.throw("Not signed in");
  });

  it("makes the lowercase wallet address the user id", () => {
    const u = authFromEvent({}, { getSessionAddress: session(ADDR), adminWallets: "" });
    expect(u.id).to.equal(ADDR.toLowerCase());
    expect(u.address).to.equal(u.id);
    expect(u.app_metadata).to.deep.equal({});
  });

  it("marks only listed wallets as admin (case and spaces ignored)", () => {
    const admins = ` 0x1111111111111111111111111111111111111111 ,${ADDR.toUpperCase().replace("0X", "0x")}`;
    expect(authFromEvent({}, { getSessionAddress: session(ADDR.toLowerCase()), adminWallets: admins }).app_metadata.role).to.equal("admin");
    expect(authFromEvent({}, { getSessionAddress: session("0x2222222222222222222222222222222222222222"), adminWallets: admins }).app_metadata).to.deep.equal({});
    expect(parseAdmins(undefined).size).to.equal(0);
  });

  it("browser helper: asks for a nonce, signs it with the wallet, verifies, returns the address", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts = {}) => {
      calls.push([String(url), opts.method || "GET", opts.credentials]);
      const body = String(url).includes("auth-nonce") ? { message: "hello nonce" } : String(url).endsWith("auth-verify") ? { ok: true, address: ADDR.toLowerCase() } : { address: ADDR.toLowerCase() };
      return { ok: true, status: 200, json: async () => body };
    };
    let params;
    const provider = { request: async ({ method, params: p }) => { expect(method).to.equal("personal_sign"); params = p; return "0xsig"; } };
    expect(await siwe.signIn(provider, ADDR)).to.equal(ADDR.toLowerCase());
    expect(Buffer.from(params[0].slice(2), "hex").toString()).to.equal("hello nonce");
    expect(params[1]).to.equal(ADDR);
    expect(calls.map((c) => c[0].split("/").pop().split("?")[0])).to.deep.equal(["auth-nonce", "auth-verify"]);
    expect(calls.every((c) => c[2] === "same-origin")).to.equal(true);
    expect(await siwe.me()).to.equal(ADDR.toLowerCase());
    delete globalThis.fetch;
  });
});
