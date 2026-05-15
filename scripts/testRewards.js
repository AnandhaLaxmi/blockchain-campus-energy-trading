const { ethers } = require("hardhat");

async function main() {
  const energyTradingAddress = "0x7Af7d377be66C28528E012C35d9A4AB679cf972E";
  const ecoRewardsAddress    = "0x6d1A31eAB72A3B3A1Fa1cb516572Ae228c65BF54";

  const ET = await ethers.getContractAt("EnergyTrading", energyTradingAddress);
  const ECO = await ethers.getContractAt("EcoRewards", ecoRewardsAddress);

  console.log("\n=== 📊 Running Reward Test ===\n");

  // ------------------------------------
  // LOAD PARTICIPANTS FROM ARRAY LENGTH
  // ------------------------------------
  let participants = [];

  // try new style
  try {
    const length = await ET.participantsLength();
    for (let i = 0; i < length; i++) {
      participants.push(await ET.participants(i));
    }
  } catch (err) {
    // fallback: common public array getter
    console.log("Fallback: scanning participants[] until empty...");
    let i = 0;
    while (true) {
      try {
        const addr = await ET.participants(i);
        participants.push(addr);
        i++;
      } catch {
        break;
      }
    }
  }

  if (participants.length === 0) {
    console.log("❌ No participants found. Set metrics first.");
    return;
  }

  console.log("Participants:", participants);

  let highest = 0;
  const rows = [];

  // ------------------------------------
  // LOAD METRICS + SCORES
  // ------------------------------------
  for (const user of participants) {
    const m = await ET.metricsOf(user);
    const score = await ET.computeScoreBps(user);

    highest = Math.max(highest, Number(score));

    rows.push({
      user,
      baseline: Number(m.baseline),
      actual: Number(m.actual),
      peak: Number(m.peakReductionBps),
      pf: Number(m.powerFactorBps),
      renewable: Number(m.renewableBps),
      score: Number(score)
    });
  }

  console.log("\n=== 🧮 On-chain Scores ===");
  console.table(rows);
  console.log("Highest score =", highest);

  // ------------------------------------
  // EXPECTED REWARDS
  // ------------------------------------
  const baseReward = ethers.utils.parseUnits("1000", 18);

  const withRewards = rows.map(r => {
    const reward = highest === 0
      ? 0
      : (BigInt(baseReward) * BigInt(r.score)) / BigInt(highest);
    return { ...r, reward: reward.toString() };
  });

  console.log("\n=== 💰 Expected Rewards ===");
  console.table(withRewards);

  // ------------------------------------
  // CALL rewardUsers()
  // ------------------------------------
  console.log("\n🚀 Sending reward transaction...");
  const tx = await ET.rewardUsers(baseReward);
  await tx.wait();
  console.log("✅ Rewards distributed!");

  // ------------------------------------
  // PRINT FINAL ECO BALANCES
  // ------------------------------------
  const balances = [];
  for (const user of participants) {
    const bal = await ECO.balanceOf(user);
    balances.push({
      user,
      eco: ethers.utils.formatUnits(bal, 18)
    });
  }

  console.log("\n=== 🟢 Final ECO Balances ===");
  console.table(balances);

  console.log("\n🎉 Reward test completed successfully.\n");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
