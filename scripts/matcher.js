require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

// -----------------------
// ENV
// -----------------------
const RPC = process.env.SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.MATCHER_PRIVATE_KEY;
const ENERGY_CONTRACT = process.env.ENERGY_CONTRACT_ADDRESS;

if (!RPC || !PRIVATE_KEY || !ENERGY_CONTRACT) {
  throw new Error("Missing RPC / KEY / CONTRACT in .env");
}

// -----------------------
// ETHERS v5 PROVIDER+SIGNER
// -----------------------
const provider = new ethers.providers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

(async () => {
  console.log("⚡ MATCHER SIGNER:", await wallet.getAddress());
})();

// -----------------------
// Load ABI
// -----------------------
const abiPath = path.join(
  __dirname,
  "../artifacts/contracts/EnergyTrading.sol/EnergyTrading.json"
);
if (!fs.existsSync(abiPath)) {
  throw new Error("ABI missing. Run: npx hardhat compile");
}
const MarketABI = JSON.parse(fs.readFileSync(abiPath, "utf8")).abi;

const market = new ethers.Contract(ENERGY_CONTRACT, MarketABI, wallet);

// -----------------------
// State
// -----------------------
let storedMatches = {};
let dynamicWeights = { w1: 0.5, w2: 0.2, w3: 0.2, w4: 0.1 };
const DMAX = 100;

// -----------------------
// Utils
// -----------------------
function overlap(a1, b1, a2, b2) {
  const s = Math.max(a1, a2);
  const e = Math.min(b1, b2);
  if (e <= s) return 0;
  const L = Math.min(b1 - a1, b2 - a2);
  return L === 0 ? 0 : (e - s) / L;
}

const toBps = (x) => Math.max(0, Math.min(10000, Math.round(x * 10000)));

function util(b, s) {
  const W = dynamicWeights;
  const term1 = b.price - s.price;
  const term2 = 1 - Math.min(Math.abs(b.loc - s.loc) / DMAX, 1);
  const term3 = Math.min(b.amount, s.amount) / (b.amount || 1);
  const term4 = overlap(b.start, b.end, s.start, s.end);

  return W.w1 * term1 + W.w2 * term2 + W.w3 * term3 + W.w4 * term4;
}

function reason(b, s, u) {
  return `Δp=${(b.price - s.price).toFixed(4)}, loc=${b.loc}:${s.loc}, util=${u.toFixed(3)}`;
}

// -----------------------
// Fetch orders
// -----------------------
async function getActiveOrders() {
  const list = await market.getActiveOrders();

  return list.map((o) => ({
    id: Number(o.id),
    user: o.user,
    amount: Number(o.amount),
    price: Number(ethers.utils.formatUnits(o.pricePerUnit, 18)),
    loc: Number(o.locationId),
    start: Number(o.startTime),
    end: Number(o.endTime),
    expiry: Number(o.expiry),
    isBuy: o.isBuy,
  }));
}

// -----------------------
// Matching Engine
// -----------------------
async function computeMatches() {
  console.log("⚡ Computing matches...");

  const orders = await getActiveOrders();
  console.log("📦 Active orders:", orders.length);

  const buys = orders.filter((o) => o.isBuy);
  const sells = orders.filter((o) => !o.isBuy);
  const now = Math.floor(Date.now() / 1000);
  const thr = Number(await market.scoreThresholdBps());

  const next = {};

  for (const b of buys) {
    for (const s of sells) {
      if (b.user === s.user) continue;
      if (b.price < s.price) continue;
      if (b.expiry < now || s.expiry < now) continue;

      const u = util(b, s);
      const bps = toBps(u);
      if (bps < thr) continue;

      const key = `${b.id}-${s.id}`;
      const price = (b.price + s.price) / 2;

      next[key] = {
        proposalId: key,
        buyOrderId: b.id,
        sellOrderId: s.id,
        amount: Math.min(b.amount, s.amount),
        price,
        scoreBps: bps,
        reason: reason(b, s, u),
        buyer: b.user,
        seller: s.user,
        buyerAccepted: storedMatches[key]?.buyerAccepted || false,
        sellerAccepted: storedMatches[key]?.sellerAccepted || false,
        finalized: storedMatches[key]?.finalized || false,
      };
    }
  }

  storedMatches = next;

  console.log("🎯 Matches found:", Object.keys(storedMatches).length);
  return Object.values(storedMatches);
}

// -----------------------
// API SERVER
// -----------------------
const app = express();
app.use(cors());
app.use(express.json());
app.post("/weights", (req, res) => {
  const { w1, w2, w3, w4 } = req.body;

  if ([w1, w2, w3, w4].some(v => typeof v !== "number")) {
    return res.status(400).json({ ok: false, error: "Invalid weights" });
  }

  dynamicWeights = { w1, w2, w3, w4 };
  console.log("🔧 Matcher weights updated:", dynamicWeights);

  res.json({ ok: true, weights: dynamicWeights });
});

app.get("/matches", async (req, res) => {
  const result = await computeMatches();
  res.json({ matches: result });
});

app.post("/accept", async (req, res) => {
  const { proposalId, side } = req.body;
  const m = storedMatches[proposalId];
  if (!m) return res.json({ ok: false, error: "proposal not found" });

  if (side === "buyer") m.buyerAccepted = true;
  if (side === "seller") m.sellerAccepted = true;

  if (m.buyerAccepted && m.sellerAccepted && !m.finalized) {
    try {
      const tx = await market.executeMatch(
        m.buyOrderId,
        m.sellOrderId,
        m.amount,
        ethers.utils.parseUnits(String(m.price), 18)
      );
      await tx.wait();
      m.finalized = true;
    } catch (err) {
      console.error("❌ executeMatch failed:", err);
      return res.json({ ok: false, error: "settlement failed" });
    }
  }

  res.json({ ok: true, match: m });
});

// -----------------------
app.listen(8787, () => {
  console.log("🟢 Matcher API at http://localhost:8787");
  //setInterval(computeMatches, 10000);
});
