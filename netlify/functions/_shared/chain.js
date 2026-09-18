// netlify/functions/_shared/chain.js
//
// All on-chain reads happen HERE, server-side, using the same Alchemy
// Sepolia RPC URL already used for deployment (SEPOLIA_RPC_URL in .env).
// The browser never talks to Alchemy directly — that would be a
// third-party network request from the client, which the site's CSP
// (connect-src 'self') is built to disallow.
//
// Contract addresses are env vars, not hardcoded, because this project
// has already redeployed GradToken/GradStaking once (Phase 5 tokenomics
// fix) — hardcoding addresses here means a silent stale-address bug the
// next time that happens. Set these in Netlify env vars; see db/SETUP.md.

const { ethers } = require("ethers");

let provider = null;

function getProvider() {
  if (provider) return provider;
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  if (!rpcUrl) {
    throw new Error("SEPOLIA_RPC_URL missing from Netlify env vars.");
  }
  provider = new ethers.JsonRpcProvider(rpcUrl);
  return provider;
}

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
];

const STAKING_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function earned(address account) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
];

const CERTIFICATE_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getCertificate(uint256 tokenId) view returns (tuple(string courseName, string issuer, uint64 completedAt, uint8 score, string metadataURI))",
];

function requireAddress(envVar) {
  const addr = process.env[envVar];
  if (!addr) throw new Error(`${envVar} missing from Netlify env vars.`);
  return addr;
}

function getGradTokenContract() {
  return new ethers.Contract(
    requireAddress("GRAD_TOKEN_ADDRESS"),
    ERC20_ABI,
    getProvider()
  );
}

function getGradStakingContract() {
  return new ethers.Contract(
    requireAddress("GRAD_STAKING_ADDRESS"),
    STAKING_ABI,
    getProvider()
  );
}

function getGradCertificateContract() {
  return new ethers.Contract(
    requireAddress("GRAD_CERTIFICATE_ADDRESS"),
    CERTIFICATE_ABI,
    getProvider()
  );
}

module.exports = {
  getProvider,
  getGradTokenContract,
  getGradStakingContract,
  getGradCertificateContract,
};
