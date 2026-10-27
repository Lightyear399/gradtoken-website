// Bundled into ../walletconnect.bundle.js (self-hosted, so the page's script-src stays 'self').
// Exposes window.GradWC. No QR modal: we draw our own so no styles are injected.
const { EthereumProvider } = require("@walletconnect/ethereum-provider");
const { deepLinks, qrSvg } = require("./helpers");

async function createWcProvider({ projectId, chainId, rpcUrl, onUri }) {
  const provider = await EthereumProvider.init({
    projectId,
    optionalChains: [chainId],          // optional so wallets without this test network can still connect
    rpcMap: { [chainId]: rpcUrl },      // reads (eth_call, receipts) go straight to this RPC
    showQrModal: false,
    methods: ["eth_sendTransaction", "personal_sign"],
    optionalMethods: ["wallet_switchEthereumChain", "wallet_addEthereumChain"],
    events: ["chainChanged", "accountsChanged"],
    metadata: { name: "GradToken", description: "Learn, earn GRAD and keep verifiable certificates", url: location.origin, icons: [location.origin + "/icons/icon-192.png"] },
  });
  if (onUri) provider.on("display_uri", onUri);
  return provider;
}
window.GradWC = { createWcProvider, deepLinks, qrSvg };
