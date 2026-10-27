const { expect } = require("chai");
const { ethers } = require("hardhat");
const V = require("../verify/verify-core");

describe("public certificate page", () => {
  it("reads a real certificate through plain eth_call and decodes it", async () => {
    const [admin, minter, alice, stranger] = await ethers.getSigners();
    const cert = await (await ethers.getContractFactory("GradCertificate")).deploy(admin.address, minter.address);
    await cert.connect(minter).issueCourse(alice.address, ethers.id("solidity-basics"), ethers.id("e"));
    await cert.connect(minter).issueCourse(alice.address, ethers.id("data-analytics"), ethers.id("e"));
    await cert.connect(minter).issueCourse(alice.address, ethers.id("not-in-catalog"), ethers.id("e"));

    const raw = await ethers.provider.call({ to: await cert.getAddress(), data: V.tokenUriCall(alice.address) });
    const parsed = V.parseCertificate(V.decodeString(raw));
    expect(parsed.total).to.equal(3);
    expect(parsed.courses.map((c) => c.title)).to.deep.equal(["Solidity Basics", "Data Analytics", "Course " + ethers.id("not-in-catalog").slice(0, 10)]);
    expect(parsed.courses[0].issuer).to.equal(minter.address.toLowerCase()); // on-chain JSON uses lowercase hex

    // wallet with no certificate: the call reverts, which the page shows as "No certificate found"
    let reverted = false;
    try { await ethers.provider.call({ to: await cert.getAddress(), data: V.tokenUriCall(stranger.address) }); } catch { reverted = true; }
    expect(reverted).to.equal(true);
  });

  it("validates addresses and the catalog map matches slug hashes", () => {
    expect(V.isAddress("0x" + "ab".repeat(20))).to.equal(true);
    expect(V.isAddress("0x123")).to.equal(false);
    expect(Object.keys(V.TITLES)).to.have.length(20);
    expect(V.TITLES[ethers.id("copywriting")]).to.equal("Copywriting");
  });
});
