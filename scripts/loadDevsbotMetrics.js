const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const hre = require("hardhat");

const DEVSBOT_DIR = path.join(__dirname, "../devsbot");
const ADDRESS_MAP = require("../src/data/deptAddressMap.json");

const RENEWABLE_BPS = 1000; // 10% renewable (placeholder)

// -------------------- helpers --------------------

function readCSVSmart(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");

  const lines = raw.split("\n");
  const startIdx = lines.findIndex(l =>
    l.trim().startsWith("Device Name,kWh")
  );

  if (startIdx === -1) {
    throw new Error(`Device table not found in ${filePath}`);
  }

  const cleanCSV = lines.slice(startIdx).join("\n");

  return parse(cleanCSV, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function avg(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// -------------------- hourly processing --------------------

function processHourly(deptName) {
  const TARGET_MONTH = "2024-08";

  let peakHours = 0;
  let totalHours = 0;
  let pfValues = [];

  const file = path.join(
    DEVSBOT_DIR,
    TARGET_MONTH,
    "hourly",
    `${deptName}.csv`
  );

  if (!fs.existsSync(file)) {
    return { peakReductionBps: 0, powerFactorBps: 0 };
  }

  const rows = parse(fs.readFileSync(file), {
    columns: true,
    skip_empty_lines: true,
  });

  for (const r of rows) {
    const hour = new Date(r["Time"]).getHours();
    const power = Number(r["Average Power"] || 0);
    const pf = Math.abs(Number(r["Power Factor"] || 0));

    if (hour >= 18 && hour <= 22 && power > 0) peakHours++;
    totalHours++;

    if (pf > 0) pfValues.push(pf);
  }

  const peakReductionBps =
    totalHours === 0 ? 0 : Math.floor((peakHours * 10000) / totalHours);

  const powerFactorBps = Math.floor(avg(pfValues) * 10000);

  return { peakReductionBps, powerFactorBps };
}

// -------------------- main loader --------------------

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🚀 Loading Devsbot metrics as:", deployer.address);

  const ET = await hre.ethers.getContractAt(
    "EnergyTrading",
    process.env.ENERGY_TRADING_ADDRESS
  );

  const TARGET_MONTH = "2024-08";
  const monthlyDir = path.join(DEVSBOT_DIR, TARGET_MONTH, "monthly");

  // 🔧 Sustainability weights (must sum to 1)
  const WEIGHTS = {
    wE: 0.4,  // Energy reduction
    wP: 0.25, // Peak-hour efficiency
    wF: 0.2,  // Power factor
    wR: 0.15, // Renewable usage
  };

  console.log("\n📊 Reading MONTHLY data...");

  for (const file of fs.readdirSync(monthlyDir)) {
    if (!file.endsWith(".csv")) continue;

    const rows = readCSVSmart(path.join(monthlyDir, file));

    for (const row of rows) {
      const dept = row["Device Name"];
      if (!ADDRESS_MAP[dept]) continue;

      const addr = ADDRESS_MAP[dept];
      const actual = Math.round(Number(row["kWh"]));
      const baseline = Math.round(actual * 1.2);

      const { peakReductionBps, powerFactorBps } = processHourly(dept);

      // -------------------- PAPER-EXACT METRICS --------------------

      const Ei = clamp01((baseline - actual) / baseline);
      const Pi = clamp01(1 - peakReductionBps / 10000);
      const Fi = clamp01(powerFactorBps / 10000);
      const Ri = clamp01(RENEWABLE_BPS / 10000);

      const Si =
        WEIGHTS.wE * Ei +
        WEIGHTS.wP * Pi +
        WEIGHTS.wF * Fi +
        WEIGHTS.wR * Ri;

      // -------------------- LOGGING --------------------

      console.log(`🏢 ${dept}`);
      console.log(`   address        : ${addr}`);
      console.log(`   baseline kWh   : ${baseline}`);
      console.log(`   actual kWh     : ${actual}`);
      console.log(`   Ei             : ${(Ei * 100).toFixed(2)}%`);
      console.log(`   Pi             : ${(Pi * 100).toFixed(2)}%`);
      console.log(`   Fi             : ${(Fi * 100).toFixed(2)}%`);
      console.log(`   Ri             : ${(Ri * 100).toFixed(2)}%`);
      console.log(`   Si (FINAL)     : ${(Si * 100).toFixed(2)}%`);

      // -------------------- ON-CHAIN (UNCHANGED) --------------------

      const tx = await ET.setMetrics(
        addr,
        baseline,
        actual,
        peakReductionBps,
        powerFactorBps,
        RENEWABLE_BPS
      );
      await tx.wait();
    }
  }

  console.log("\n✅ Devsbot metrics loaded (composite score computed off-chain)");
}

main().catch(console.error);
