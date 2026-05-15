const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Smart Energy System", function () {
  let energyToken, ecoRewards, auditLog, energyTrading;
  let deployer, user1, user2;

  beforeEach(async () => {
    [deployer, user1, user2] = await ethers.getSigners();

    // Deploy EnergyToken
    const EnergyToken = await ethers.getContractFactory("EnergyToken");
    energyToken = await EnergyToken.deploy(ethers.parseUnits("10000", 18));
    await energyToken.waitForDeployment();

    // Deploy EcoRewards
    const EcoRewards = await ethers.getContractFactory("EcoRewards");
    ecoRewards = await EcoRewards.deploy(ethers.parseUnits("5000", 18), deployer.address);
    await ecoRewards.waitForDeployment();

    // Deploy AuditLog
    const AuditLog = await ethers.getContractFactory("AuditLog");
    auditLog = await AuditLog.deploy();
    await auditLog.waitForDeployment();

    // Deploy EnergyTrading
    const EnergyTrading = await ethers.getContractFactory("EnergyTrading");
    energyTrading = await EnergyTrading.deploy(
      await energyToken.getAddress(),
      await ecoRewards.getAddress(),
      await auditLog.getAddress()
    );
    await energyTrading.waitForDeployment();

    // Set EnergyTrading contract as minter of EcoRewards
    await ecoRewards.setMinter(await energyTrading.getAddress());

    // Distribute tokens
    await energyToken.transfer(user1.address, ethers.parseUnits("1000", 18));
    await energyToken.transfer(user2.address, ethers.parseUnits("1000", 18));

    await ecoRewards.transfer(user1.address, ethers.parseUnits("100", 18));
    await ecoRewards.transfer(user2.address, ethers.parseUnits("100", 18));

    // Approve EnergyTrading to spend user tokens
    await energyToken.connect(user1).approve(await energyTrading.getAddress(), ethers.parseUnits("500", 18));
    await energyToken.connect(user2).approve(await energyTrading.getAddress(), ethers.parseUnits("500", 18));
  });

  it("should allow matching of buy and sell energy orders", async () => {
    const timestamp = 123456;

    // User1 wants to buy 50 units
    await energyTrading.connect(user1).postBuyOrder(ethers.parseUnits("50", 18), timestamp);

    // User2 wants to sell 50 units
    await energyTrading.connect(user2).postSellOffer(ethers.parseUnits("50", 18), timestamp);

    // Match orders
    await energyTrading.connect(deployer).matchOrders();

    const balance1 = await energyToken.balanceOf(user1.address);
    const balance2 = await energyToken.balanceOf(user2.address);

    expect(balance1).to.equal(ethers.parseUnits("950", 18));
    expect(balance2).to.equal(ethers.parseUnits("1050", 18));
  });

  it("should reward the most energy-efficient user", async () => {
    await energyTrading.connect(deployer).setEnergyUsage(user1.address, 120);
    await energyTrading.connect(deployer).setEnergyUsage(user2.address, 80); // more efficient

    await energyTrading.connect(deployer).rewardLowestUser();

    const reward1 = await ecoRewards.balanceOf(user1.address);
    const reward2 = await ecoRewards.balanceOf(user2.address);

    expect(reward2).to.be.gt(reward1);
  });

  it("should not re-match already fulfilled orders", async () => {
  // Post matching buy and sell orders
  await energyTrading.connect(user1).postBuyOrder(ethers.parseUnits("50", 18), 123456);
  await energyTrading.connect(user2).postSellOffer(ethers.parseUnits("50", 18), 123456);

  // First match
  await energyTrading.connect(deployer).matchOrders();

  // Try to match again (should NOT change anything or throw error)
  await energyTrading.connect(deployer).matchOrders();

  const [buyOrder] = await energyTrading.getBuyOrders();
  const [sellOrder] = await energyTrading.getSellOrders();

  expect(buyOrder.fulfilled).to.equal(true);
  expect(sellOrder.fulfilled).to.equal(true);
});

it("should restrict matchOrders and rewardLowestUser to only owner", async () => {
  // Set energy usage by owner (this should work)
  await energyTrading.connect(deployer).setEnergyUsage(user1.address, 50);

  // These calls should fail when made by non-owner
  await expect(
    energyTrading.connect(user1).matchOrders()
  ).to.be.revertedWith("Not authorized");

  await expect(
    energyTrading.connect(user2).rewardLowestUser()
  ).to.be.revertedWith("Not authorized");

  // This one should succeed
  await expect(
    energyTrading.connect(deployer).rewardLowestUser()
  ).to.not.be.reverted;
});

});

