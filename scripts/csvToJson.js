const fs = require("fs");
const path = require("path");
const readline = require("readline");

const inputFile = path.join("C:/Users/anand/Hardhat/energy-dapp/src/data/monthlyEnergy.csv");
const outputFile = path.join("C:/Users/anand/Hardhat/energy-dapp/src/data/monthlyEnergy.json");

const energyData = {};
let isDataSection = false;

(async () => {
  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Device Name")) {
      isDataSection = true; // Start parsing from next line
      continue;
    }

    if (!isDataSection || !trimmed) continue; // Skip blank/summary lines

    const parts = trimmed.split(",");
    if (parts.length < 2) continue;

    const name = parts[0]?.trim();
    const kWh = parseFloat(parts[1]);

    if (name && !isNaN(kWh)) {
      energyData[name] = kWh;
    }
  }

  fs.writeFileSync(outputFile, JSON.stringify(energyData, null, 2));
  console.log("✅ Done! Output saved to monthlyEnergy.json");
})();
