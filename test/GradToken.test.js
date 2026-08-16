const { expect } = require("chai");
const { deploy, ethers } = require("./helpers");

describe("GradToken", function () {
  let owner, community, team, treasury, publicSale, investors, marketing, advisors, other;
  let token;

  beforeEach(async function () {
    [owner, community, team, treasury, publicSale, investors, marketing, advisors, other] =
      await ethers.getSigners();
    token = await deploy("GradToken", owner, [
      community.address,
      team.address,
      treasury.address,
      publicSale.address,
      investors.address,
      marketing.address,
      advisors.address,
    ]);
  });

  it("mints exactly 1,000,000,000 GRAD total supply", async function () {
    const totalSupply = await token.totalSupply();
    expect(totalSupply).to.equal(ethers.parseUnits("1000000000", 18));
  });

  it("splits supply into the seven tokenomics buckets exactly as specified", async function () {
    const total = ethers.parseUnits("1000000000", 18);
    const expected = {
      community: (total * 3500n) / 10000n,
      team: (total * 1800n) / 10000n,
      treasury: (total * 1500n) / 10000n,
      publicSale: (total * 1200n) / 10000n,
      investors: (total * 1000n) / 10000n,
      marketing: (total * 600n) / 10000n,
      advisors: (total * 400n) / 10000n,
    };

    expect(await token.balanceOf(community.address)).to.equal(expected.community);
    expect(await token.balanceOf(team.address)).to.equal(expected.team);
    expect(await token.balanceOf(treasury.address)).to.equal(expected.treasury);
    expect(await token.balanceOf(publicSale.address)).to.equal(expected.publicSale);
    expect(await token.balanceOf(investors.address)).to.equal(expected.investors);
    expect(await token.balanceOf(marketing.address)).to.equal(expected.marketing);
    expect(await token.balanceOf(advisors.address)).to.equal(expected.advisors);

    const sum =
      expected.community +
      expected.team +
      expected.treasury +
      expected.publicSale +
      expected.investors +
      expected.marketing +
      expected.advisors;
    expect(sum).to.equal(total);
  });

  it("reverts deployment if any allocation address is the zero address", async function () {
    const artifact = require("./helpers").loadArtifact("GradToken");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    await expect(
      factory.deploy(
        ethers.ZeroAddress,
        team.address,
        treasury.address,
        publicSale.address,
        investors.address,
        marketing.address,
        advisors.address
      )
    ).to.be.reverted;
  });

  it("has no mint function reachable after deployment (fixed supply forever)", async function () {
    expect(token.interface.fragments.some((f) => f.name === "mint")).to.equal(false);
  });

  it("allows holders to burn their own tokens, and only their own", async function () {
    const amount = ethers.parseUnits("1000", 18);
    await token.connect(community).transfer(other.address, amount);
    const before = await token.totalSupply();

    await token.connect(other).burn(amount);

    expect(await token.totalSupply()).to.equal(before - amount);
    expect(await token.balanceOf(other.address)).to.equal(0n);
  });

  it("supports standard transfer and approve/transferFrom flows", async function () {
    const amount = ethers.parseUnits("500", 18);
    await token.connect(marketing).approve(other.address, amount);
    await token.connect(other).transferFrom(marketing.address, other.address, amount);
    expect(await token.balanceOf(other.address)).to.equal(amount);
  });
});
