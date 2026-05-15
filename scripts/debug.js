async function main() {
  const ET = await ethers.getContractAt(
    "EnergyTrading",
    "0x7Af7d377be66C28528E012C35d9A4AB679cf972E"
  );

  console.log("=== PARTICIPANTS LIST ===");

  for (let i = 0; i < 20; i++) {
    try {
      const p = await ET.participants(i);
      console.log(`Index ${i}:`, p);
    } catch (e) {
      console.log("Reached end of participants at index", i);
      break;
    }
  }

  console.log("\n=== METRICS DUMP ===");

  for (let i = 0; i < 20; i++) {
    try {
      const p = await ET.participants(i);
      const m = await ET.metricsOf(p);
      const score = await ET.computeScoreBps(p);

      console.log({
        index: i,
        address: p,
        baseline: m.baseline.toString(),
        actual: m.actual.toString(),
        peakReductionBps: m.peakReductionBps.toString(),
        powerFactorBps: m.powerFactorBps.toString(),
        renewableBps: m.renewableBps.toString(),
        score: score.toString()
      });
    } catch (e) {
      break;
    }
  }
}

main().catch(console.error);
