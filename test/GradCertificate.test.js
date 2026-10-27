const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const C1 = ethers.id("solidity-basics");
const C2 = ethers.id("intro-to-blockchain");
const EV = ethers.id("capstone-repo-hash");

async function fixture() {
  const [admin, minter, inst, alice, bob, stranger] = await ethers.getSigners();
  const cert = await (await ethers.getContractFactory("GradCertificate")).deploy(admin.address, minter.address);
  await cert.connect(admin).grantRole(await cert.INSTITUTION_ROLE(), inst.address);
  return { admin, minter, inst, alice, bob, stranger, cert };
}

describe("GradCertificate v2", () => {
  it("mints one locked token on first course and adds later courses to it", async () => {
    const { cert, minter, alice } = await loadFixture(fixture);
    const id = await cert.tokenIdOf(alice.address);
    await expect(cert.connect(minter).issueCourse(alice.address, C1, EV))
      .to.emit(cert, "Locked").withArgs(id);
    await cert.connect(minter).issueCourse(alice.address, C2, EV);
    expect(await cert.balanceOf(alice.address)).to.equal(1);
    expect(await cert.courseCount(alice.address)).to.equal(2);
    expect(await cert.ownerOf(id)).to.equal(alice.address);
    expect(await cert.locked(id)).to.equal(true);
  });

  it("blocks duplicates, bad input and unauthorised issuers", async () => {
    const { cert, minter, alice, stranger } = await loadFixture(fixture);
    await cert.connect(minter).issueCourse(alice.address, C1, EV);
    await expect(cert.connect(minter).issueCourse(alice.address, C1, EV))
      .to.be.revertedWithCustomError(cert, "AlreadyIssued");
    await expect(cert.connect(stranger).issueCourse(alice.address, C2, EV))
      .to.be.revertedWithCustomError(cert, "NotIssuer");
    await expect(cert.connect(minter).issueCourse(ethers.ZeroAddress, C2, EV))
      .to.be.revertedWithCustomError(cert, "ZeroAddress");
    await expect(cert.connect(minter).issueCourse(alice.address, ethers.ZeroHash, EV))
      .to.be.revertedWithCustomError(cert, "InvalidCourse");
  });

  it("lets an approved institution issue", async () => {
    const { cert, inst, bob } = await loadFixture(fixture);
    await cert.connect(inst).issueCourse(bob.address, C1, EV);
    expect(await cert.hasCourse(bob.address, C1)).to.equal(true);
  });

  it("is non-transferable and non-approvable", async () => {
    const { cert, minter, alice, bob } = await loadFixture(fixture);
    await cert.connect(minter).issueCourse(alice.address, C1, EV);
    const id = await cert.tokenIdOf(alice.address);
    await expect(cert.connect(alice).transferFrom(alice.address, bob.address, id))
      .to.be.revertedWithCustomError(cert, "Soulbound");
    await expect(cert.connect(alice).approve(bob.address, id))
      .to.be.revertedWithCustomError(cert, "Soulbound");
    await expect(cert.connect(alice).setApprovalForAll(bob.address, true))
      .to.be.revertedWithCustomError(cert, "Soulbound");
  });

  it("revokes by admin or original issuer, burns on last revoke, allows reissue", async () => {
    const { cert, admin, minter, inst, alice, stranger } = await loadFixture(fixture);
    await cert.connect(minter).issueCourse(alice.address, C1, EV);
    await cert.connect(inst).issueCourse(alice.address, C2, EV);
    await expect(cert.connect(stranger).revokeCourse(alice.address, C1, "x"))
      .to.be.revertedWithCustomError(cert, "NotRevoker");
    await expect(cert.connect(inst).revokeCourse(alice.address, C1, "x"))
      .to.be.revertedWithCustomError(cert, "NotRevoker");
    await expect(cert.connect(inst).revokeCourse(alice.address, C2, "plagiarism"))
      .to.emit(cert, "CourseRevoked").withArgs(alice.address, C2, inst.address, "plagiarism");
    expect(await cert.balanceOf(alice.address)).to.equal(1);
    await cert.connect(admin).revokeCourse(alice.address, C1, "fraud");
    expect(await cert.balanceOf(alice.address)).to.equal(0);
    await expect(cert.connect(admin).revokeCourse(alice.address, C1, "again"))
      .to.be.revertedWithCustomError(cert, "NoSuchRecord");
    await cert.connect(minter).issueCourse(alice.address, C1, EV);
    expect(await cert.balanceOf(alice.address)).to.equal(1);
    expect(await cert.courseCount(alice.address)).to.equal(1);
  });

  it("builds on-chain metadata from active records only", async () => {
    const { cert, admin, minter, alice } = await loadFixture(fixture);
    await cert.connect(admin).setImageURI("ipfs://example");
    await cert.connect(minter).issueCourse(alice.address, C1, EV);
    await cert.connect(minter).issueCourse(alice.address, C2, EV);
    await cert.connect(admin).revokeCourse(alice.address, C2, "test");
    const uri = await cert.tokenURI(await cert.tokenIdOf(alice.address));
    const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
    expect(json.total_courses).to.equal(1);
    expect(json.courses).to.have.length(1);
    expect(json.courses[0].courseId).to.equal(C1);
    expect(json.image).to.equal("ipfs://example");
    const [, active] = await cert.getCertificate(alice.address);
    expect(active).to.have.length(1);
  });

  it("supports ERC-721, ERC-5192 and AccessControl interfaces", async () => {
    const { cert } = await loadFixture(fixture);
    expect(await cert.supportsInterface("0x80ac58cd")).to.equal(true);
    expect(await cert.supportsInterface("0xb45a3c0e")).to.equal(true);
    expect(await cert.supportsInterface("0x7965db0b")).to.equal(true);
  });
});
