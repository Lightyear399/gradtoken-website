// GET /.netlify/functions/onchain-summary
//
// Deliberately takes NO address parameter — it always reads the session's
// own address. Balances are public on-chain data, so this isn't about
// hiding anything; it's about not letting this endpoint become a free,
// unauthenticated proxy that anyone can point at your Alchemy RPC key to
// drain your request quota. Requiring a session is a cheap way to keep
// this endpoint's usage tied to actual logged-in users of the site.
//
// Amounts are returned as decimal strings (formatted with 18 decimals,
// matching GradToken/GradStaking), since JSON numbers lose precision on
// values this large. No BigInt/ethers needed client-side to display them
// — see js/wallet-connect.js formatGrad() for the tiny vanilla-JS version.

const { ethers } = require("ethers");
const { json } = require("./_shared/http");
const { getSessionAddress } = require("./_shared/session");
const { getGradTokenContract, getGradStakingContract } = require("./_shared/chain");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const address = getSessionAddress(event);
  if (!address) {
    return json(401, { error: "Not signed in" });
  }

  try {
    const token = getGradTokenContract();
    const staking = getGradStakingContract();

    const [gradBalance, staked, earned] = await Promise.all([
      token.balanceOf(address),
      staking.balanceOf(address),
      staking.earned(address),
    ]);

    return json(200, {
      address,
      gradBalance: ethers.formatUnits(gradBalance, 18),
      staked: ethers.formatUnits(staked, 18),
      earned: ethers.formatUnits(earned, 18),
    });
  } catch (err) {
    return json(502, { error: "On-chain read failed: " + err.message });
  }
};
