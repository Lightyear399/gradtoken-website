const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

function loadArtifact(name) {
  const p = path.join(__dirname, "..", "build", `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function deploy(name, signer, args = []) {
  const artifact = loadArtifact(name);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function increaseTime(seconds) {
  await hre.network.provider.send("evm_increaseTime", [seconds]);
  await hre.network.provider.send("evm_mine");
}

async function currentTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

module.exports = { loadArtifact, deploy, increaseTime, currentTimestamp, ethers, hre };
