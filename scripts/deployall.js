const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const MATCHER = process.env.MATCHER_ADDRESS;
  const ETK_SUPPLY = 1_000_000;
  const ECO_SUPPLY = 500_000;
  const SCORE_THRESHOLD = 6000;

  if (!MATCHER) throw new Error("Set MATCHER_ADDRESS in .env");

  console.log("\n========== DEPLOY START ==========");
  console.log("Deployer:", deployer.address);
  console.log("Matcher :", MATCHER);
  console.log("===================================\n");

  // 1️⃣ Deploy EnergyToken
  const ETK = await ethers.getContractFactory("EnergyToken");
  const etk = await ETK.deploy(ETK_SUPPLY);
  await etk.deployed();
  console.log("EnergyToken deployed at:", etk.address);

  // 2️⃣ Deploy EcoRewards
  const ECO = await ethers.getContractFactory("EcoRewards");
  const eco = await ECO.deploy(ECO_SUPPLY, deployer.address);
  await eco.deployed();
  console.log("EcoRewards deployed at:", eco.address);

  // 3️⃣ Deploy AuditLog
  const AUD = await ethers.getContractFactory("AuditLog");
  const aud = await AUD.deploy();
  await aud.deployed();
  console.log("AuditLog deployed at:", aud.address);

  // 4️⃣ Deploy EnergyTrading
  const TR = await ethers.getContractFactory("EnergyTrading");
  const tr = await TR.deploy(etk.address, MATCHER, SCORE_THRESHOLD);
  await tr.deployed();
  console.log("EnergyTrading deployed at:", tr.address);

  // 5️⃣ Wire connections
  console.log("\n🔗 Linking contracts...");
  await (await tr.setAuditLog(aud.address)).wait();
  await (await tr.setEcoRewards(eco.address)).wait();
  await (await eco.setMinter(tr.address)).wait();
  console.log("Links completed.");

  // FINAL RESULT
  console.log("\n========= FINAL ADDRESSES =========");
  console.log("EnergyToken   :", etk.address);
  console.log("EcoRewards    :", eco.address);
  console.log("AuditLog      :", aud.address);
  console.log("EnergyTrading :", tr.address);
  console.log("===================================\n");

  console.log("🚀 Deployment completed successfully!");
}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});
