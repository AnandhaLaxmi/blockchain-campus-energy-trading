
// App.js — Smart Energy Trading DApp (Green/Blue Theme)
// Ethers v6 (BrowserProvider/Contract/parseUnits/formatUnits)
/* eslint-env es2020 */

import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserProvider,
  Contract,
  formatUnits,
  parseUnits,
  Interface,
} from "ethers";

import EnergyTokenABI from "./abis/EnergyToken.json";
import EcoRewardsABI from "./abis/EcoRewards.json";
import AuditLogABI from "./abis/AuditLog.json";
import EnergyTradingABI from "./abis/EnergyTrading.json";

import monthlyEnergy from "./data/monthlyEnergy.json";
import deptAddressMap from "./data/deptAddressMap.json";



// ====== YOUR ADDRESSES ======
const energyTokenAddress = "0x48A45261eC5Ecccc673cB05831D225C2464a658e";
const ecoRewardsAddress  = "0x6d1A31eAB72A3B3A1Fa1cb516572Ae228c65BF54";
const auditLogAddress    = "0xc34963547f090A152dA2fc3115F07250b9603103";
const energyTradingAddress = "0x7Af7d377be66C28528E012C35d9A4AB679cf972E";

const adminAddress = "0x28b336D519EC436476B7a0D27aD79F8D8b49bd6D";
const matcherAddress = "0x01C3F0E4989d77c0db16566CEA416Ce7659EDB4e";

const addressToDept = Object.fromEntries(
  Object.entries(deptAddressMap).map(([k,v]) => [v.toLowerCase(), k])
);

// ====== MATCHER WEIGHTS (UI sliders can tweak) ======
const DEFAULT_WEIGHTS = { w1: 0.5, w2: 0.2, w3: 0.2, w4: 0.1 };
const DMAX = 100; // distance normalization

// ====== TIME SLOT UTILS ======
const defaultTTLMinutes = 60; // default 1 hr

function toUnix(dateStr, timeStr) {
  if (!dateStr || !timeStr) return 0;
  const d = new Date(`${dateStr}T${timeStr}`);
  return Math.floor(d.getTime() / 1000);
}

function overlap(tStart1, tEnd1, tStart2, tEnd2) {
  const start = Math.max(tStart1, tStart2);
  const end = Math.min(tEnd1, tEnd2);
  if (end <= start) return 0;
  const len = Math.min(tEnd1 - tStart1, tEnd2 - tStart2);
  return len === 0 ? 0 : (end - start) / len;
}

function utilityScore(b, s, W) {
  const term1 = b.pricePerUnit - s.pricePerUnit; // higher spread is better
  const term2 = 1 - Math.min(Math.abs(s.locationId - b.locationId) / DMAX, 1);
  const term3 = Math.min(s.amount, b.amount) / (b.amount || 1);
  const term4 = overlap(b.startTime, b.endTime, s.startTime, s.endTime);
  return W.w1 * term1 + W.w2 * term2 + W.w3 * term3 + W.w4 * term4;
}

function reasonFor(b, s) {
  const priceGap = b.pricePerUnit - s.pricePerUnit;
  const locScore = 1 - Math.min(Math.abs(s.locationId - b.locationId) / DMAX, 1);
  const qtyScore = Math.min(s.amount, b.amount) / (b.amount || 1);
  const timeOv = overlap(b.startTime, b.endTime, s.startTime, s.endTime);
  const reasons = [];
  if (priceGap > 0) reasons.push(`Buyer pays ${(priceGap).toFixed(4)} above seller`);
  if (locScore > 0.8) reasons.push(`Nearby locations (score ${locScore.toFixed(2)})`);
  if (qtyScore > 0.8) reasons.push(`Good quantity match (${(qtyScore * 100).toFixed(0)}% of demand)`);
  if (timeOv > 0.5) reasons.push(`Strong time overlap (${(timeOv * 100).toFixed(0)}%)`);
  if (!reasons.length) reasons.push("Price & time acceptable — moderate match");
  return reasons.join("; ");
}

// Simple pill tag
const Tag = ({ children, color = "#0ea5e9" }) => (
  <span style={{
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: 999,
    background: color,
    color: "white",
    fontSize: 12,
    marginRight: 6
  }}>
    {children}
  </span>
);

// Small info tooltip
const Info = ({ text }) => (
  <span
    title={text}
    style={{
      display: "inline-flex",
      marginLeft: 6,
      width: 18,
      height: 18,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      background: "#0ea5e9",
      color: "white",
      fontSize: 12,
      cursor: "help"
    }}
  >
    i
  </span>
);

function Card({ title, right, children }) {
  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--stroke)",
      borderRadius: 16,
      padding: 16,
      boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
      marginBottom: 16
    }}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 10}}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <div style={{width:8, height:24, background:"linear-gradient(180deg,#10b981,#22d3ee)", borderRadius:4}}/>
          <h3 style={{margin:0}}>{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function App() {
  // ==== web3 state ====
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);

  const [energyTrading, setEnergyTrading] = useState(null);
  const [energyToken, setEnergyToken] = useState(null);
  const [ecoRewards, setEcoRewards] = useState(null);
  const [auditLog, setAuditLog] = useState(null);

  // ==== ui state ====
  const [themeDark, setThemeDark] = useState(true);
  const [roleView, setRoleView] = useState("all"); // 'buyer' | 'seller' | 'all'
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);

  const isAdmin =
  account &&
  account.toLowerCase() === adminAddress.toLowerCase();
  // sustainability + rewards UI
  const [metricsTable, setMetricsTable] = useState([]);
  const [rewardHistory, setRewardHistory] = useState([]);
  const [balanceETK, setBalanceETK] = useState(null);
  const [balanceECO, setBalanceECO] = useState(null);

  // place order form
  const [isBuy, setIsBuy] = useState(true);
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [locationId, setLocationId] = useState("1");
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
  const [startTime, setStartTime] = useState(""); // HH:mm
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [ttlMinutes, setTtlMinutes] = useState(String(defaultTTLMinutes));

  // orders & proposals
  const [orders, setOrders] = useState([]);
  const [proposals, setProposals] = useState([]); // fetched from matcher
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingProposals, setLoadingProposals] = useState(false);

  const [logs, setLogs] = useState([]);
  // ===== SIMULATED REWARD LEADERBOARD (OFF-CHAIN, FOR EVALUATION) =====
const simulatedRewards = useMemo(() => {
  if (metricsTable.length === 0) return [];

  const TOTAL_REWARD = 1000; // ECO tokens
  const maxScore = Math.max(...metricsTable.map(r => r.score));

  return metricsTable.map(r => ({
    user: r.address,
    score: r.score,
    reward: (TOTAL_REWARD * r.score / maxScore).toFixed(2),
    time: new Date().toLocaleString(),
    tx: "simulated"
  }));
}, [metricsTable]);


  // ===== THEME =====
  useEffect(() => {
    const root = document.documentElement;
    if (themeDark) {
      root.style.setProperty("--bg", "#0b1f17");
      root.style.setProperty("--card", "#0f2a20");
      root.style.setProperty("--stroke", "rgba(255,255,255,0.08)");
      root.style.setProperty("--text", "#e5f9f0");
      root.style.setProperty("--muted", "#b7e3d2");
      root.style.setProperty("--accent", "#22c55e"); // green
      root.style.setProperty("--accent2", "#10b981"); // teal
      root.style.setProperty("--blue", "#38bdf8");    // blue
      root.style.setProperty("--warn", "#f59e0b");
      root.style.setProperty("--bad", "#ef4444");
    } else {
      root.style.setProperty("--bg", "#f4fbf7");
      root.style.setProperty("--card", "#ffffff");
      root.style.setProperty("--stroke", "rgba(0,0,0,0.08)");
      root.style.setProperty("--text", "#06210f");
      root.style.setProperty("--muted", "#3d6e5a");
      root.style.setProperty("--accent", "#16a34a");
      root.style.setProperty("--accent2", "#0ea5e9");
      root.style.setProperty("--blue", "#0284c7");
      root.style.setProperty("--warn", "#b45309");
      root.style.setProperty("--bad", "#b91c1c");
    }
    document.body.style.background = "var(--bg)";
    document.body.style.color = "var(--text)";
    document.body.style.fontFamily = "Inter, system-ui, Arial";
  }, [themeDark]);

  // ===== CONNECT WALLET =====
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not detected");
      return;
    }
    const _provider = new BrowserProvider(window.ethereum);
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const _signer = await _provider.getSigner();
    setProvider(_provider);
    setSigner(_signer);
    setAccount(accounts[0]);

    const et = new Contract(energyTradingAddress, EnergyTradingABI.abi || EnergyTradingABI, _signer);
    const tok = new Contract(energyTokenAddress, EnergyTokenABI.abi || EnergyTokenABI, _signer);
    const eco = new Contract(ecoRewardsAddress, EcoRewardsABI.abi || EcoRewardsABI, _signer);
    const aud = new Contract(auditLogAddress, AuditLogABI.abi || AuditLogABI, _signer);

    setEnergyTrading(et);
    setEnergyToken(tok);
    setEcoRewards(eco);
    setAuditLog(aud);
  };

  // ===== ADMIN =====
  const autoSetUsage = async () => {
    if (!energyTrading) return;
    try {
      for (const dept in monthlyEnergy) {
        const usageValue = Math.round(monthlyEnergy[dept] * 10);
        const addr = deptAddressMap[dept];
        if (!addr) continue;
        const tx = await energyTrading.setEnergyUsage(addr, usageValue);
        await tx.wait();
      }
      alert("✅ Energy usage data set.");
    } catch (e) {
      console.error(e);
      alert("❌ Failed to set usage.");
    }
  };

  const distributeRewards = async () => {
  try {
    const tx = await energyTrading.rewardUsers(parseUnits("1000", 18));
    await tx.wait();
    alert("🌱 Sustainability rewards distributed successfully.");
    fetchRewardHistory(); // refresh history
  } catch (e) {
    console.error(e);
    alert("❌ Reward distribution failed.");
  }
};



  // ===== STATS =====
  

  const fetchBalances = async () => {
    if (energyToken && ecoRewards && account) {
      const [balETK, balECO] = await Promise.all([
        energyToken.balanceOf(account),
        ecoRewards.balanceOf(account)
      ]);
      setBalanceETK(formatUnits(balETK, 18));
      setBalanceECO(formatUnits(balECO, 18));
    }
  };

  // ===== PLACE ORDER =====
  const placeOrder = async () => {
    if (!energyTrading) return;
    if (!amount || !price || !startDate || !startTime || !endDate || !endTime) {
      alert("Please complete amount, price, start/end date & time.");
      return;
    }
    

    const _amount = BigInt(Math.floor(Number(amount)));
    const _price  = parseUnits(String(price), 18);
    const _loc    = BigInt(Math.floor(Number(locationId)));
    const startTs = BigInt(toUnix(startDate, startTime));
    const endTs   = BigInt(toUnix(endDate, endTime));
    const ttl = BigInt(Number(endTs) - Number(startTs)); // automatic TTL = end - start
    if (ttl <= 0n) {
      alert("End time must be after start time.");
      return;
    }

    if (endTs <= startTs) {
      alert("End time must be after start time.");
      return;
    }

    // === Check ETK for BUY orders (exact cost) ===
if (isBuy) {
  const costFloat = Number(amount) * Number(price);
  const costWei = parseUnits(String(costFloat), 18);
  const bal = await energyToken.balanceOf(account);
  if (bal < costWei) {
    alert(`❌ Not enough ETK. You need ${costFloat} ETK to place this buy.`);
    return;
  }
}

    try {
      // placeOrder(bool isBuy, uint amount, uint pricePerUnit, uint locationId, uint startTime, uint endTime, uint ttlSeconds)
      const tx = await energyTrading.placeOrder(
        isBuy,
        _amount,
        _price,
        _loc,
        startTs,
        endTs,
        ttl
      );
      await tx.wait();
      alert(`✅ ${isBuy ? "Buy" : "Sell"} order posted.`);
      await loadOrders();
    } catch (e) {
      console.error(e);
      alert("❌ Failed to place order.");
    }
  };

  // ===== LOAD ORDERS =====
  const loadOrders = async () => {
    if (!energyTrading) return;
    setLoadingOrders(true);
    try {
      const nextId = await energyTrading.nextOrderId();
      const n = Number(nextId);
      const results = [];
      for (let i = 1; i <= n; i++) {
        const o = await energyTrading.getOrder(i);
        if (!o || !o.active) continue;
        results.push({
          id: Number(o.id),
          user: o.user,
          amount: Number(o.amount),
          pricePerUnit: Number(formatUnits(o.pricePerUnit, 18)),
          locationId: Number(o.locationId),
          startTime: Number(o.startTime),
          endTime: Number(o.endTime),
          expiry: Number(o.expiry || 0),
          filled: Number(o.filled || 0),
          isBuy: o.isBuy,
          active: o.active
        });
      }
      setOrders(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrders(false);
    }
  };

  // ===== LOAD PROPOSALS (FROM MATCHER API) =====
  const loadProposals = async () => {
    try {
      setLoadingProposals(true);

      // 1) Send current slider weights to matcher
      await fetch("http://localhost:8787/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weights),
      });

      // 2) Now fetch matches
      const res = await fetch("http://localhost:8787/matches");
      const json = await res.json();
      setProposals(json.matches || []);
    } catch (e) {
      console.error("Failed to fetch matcher proposals", e);
    } finally {
      setLoadingProposals(false);
    }
  };

  // ===== PRICE INSIGHTS =====
  const { buyAvg, sellAvg } = useMemo(() => {
    const buys = orders.filter(o => o.isBuy).map(o => o.pricePerUnit);
    const sells = orders.filter(o => !o.isBuy).map(o => o.pricePerUnit);
    const avg = (arr) => (arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0);
    return { buyAvg: avg(buys), sellAvg: avg(sells) };
  }, [orders]);

  const priceHint = useMemo(() => {
    const p = Number(price || "0");
    if (!p || (!buyAvg && !sellAvg)) return null;
    if (isBuy) {
      if (sellAvg && p < sellAvg) return { tone: "warn", text: `Your buy price is below average sell (${sellAvg.toFixed(4)}). Match chance is low.` };
      if (sellAvg && p > sellAvg * 1.5) return { tone: "soft", text: `Your buy price is much higher than average sell (${sellAvg.toFixed(4)}). You may overpay.` };
      if (sellAvg) return { tone: "ok", text: `Near market — avg sell: ${sellAvg.toFixed(4)}` };
    } else {
      if (buyAvg && p > buyAvg) return { tone: "warn", text: `Your sell price is above average buy (${buyAvg.toFixed(4)}). Match chance is low.` };
      if (buyAvg && p < buyAvg * 0.7) return { tone: "soft", text: `Your sell price is much lower than average buy (${buyAvg.toFixed(4)}). You may underprice.` };
      if (buyAvg) return { tone: "ok", text: `Near market — avg buy: ${buyAvg.toFixed(4)}` };
    }
    return null;
  }, [price, isBuy, buyAvg, sellAvg]);

  // ===== ACCEPT PROPOSAL (via matcher server) =====
  // ===== ACCEPT PROPOSAL (via matcher server, exact-allowance path) =====
const tryAccept = async (side, buyId, sellId) => {
  const proposalId = `${buyId}-${sellId}`;

  // Find proposal to compute exact cost (price * amount)
  const prop = proposals.find(p => `${p.buyOrderId}-${p.sellOrderId}` === proposalId);
  if (!prop) {
    alert("Proposal not found in local state.");
    return;
  }

  const totalCostFloat = Number(prop.price) * Number(prop.amount);
  const totalCostWei = parseUnits(String(totalCostFloat), 18);

  // If buyer: check balance + approve exact amount to matcher
  if (side === "buyer") {
    try {
      const bal = await energyToken.balanceOf(account);
      if (bal < totalCostWei) {
        alert(`❌ Not enough ETK to accept. Need ${totalCostFloat} ETK.`);
        return;
      }

     // spender must be the EnergyTrading contract now
const spender = energyTradingAddress; // NOT matcherAddress anymore

const allowance = await energyToken.allowance(account, spender);
if (allowance < totalCostWei) {
  const txA = await energyToken.approve(spender, totalCostWei);
  await txA.wait();


      }
    } catch (e) {
      console.error("Approval failed:", e);
      alert("❌ ETK approval failed.");
      return;
    }
  }

  // Optimistic UI update
  setProposals(prev => prev.map(m => {
    if (`${m.buyOrderId}-${m.sellOrderId}` === proposalId) {
      if (side === "buyer") return { ...m, buyerAccepted: true };
      if (side === "seller") return { ...m, sellerAccepted: true };
    }
    return m;
  }));

  try {
    const res = await fetch("http://localhost:8787/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId, side })
    });
    const out = await res.json();

    if (out?.ok === false) {
      alert(`❌ ${out.error || "Settlement failed"}`);
    }

    if (out?.match) {
      // Sync UI with server response
      setProposals(prev => prev.map(m => {
        const key = `${m.buyOrderId}-${m.sellOrderId}`;
        if (key === proposalId) return { ...m, ...out.match };
        return m;
      }));
    }
  } catch (err) {
    console.error(err);
    alert("❌ Failed to accept proposal");

    // Revert optimistic update on error
    setProposals(prev => prev.map(m => {
      if (`${m.buyOrderId}-${m.sellOrderId}` === proposalId) {
        if (side === "buyer") return { ...m, buyerAccepted: false };
        if (side === "seller") return { ...m, sellerAccepted: false };
      }
      return m;
    }));
  }
};
const fetchAllMetrics = async () => {
  if (!energyTrading) return;

  try {
    const rows = [];
    let i = 0;

    while (true) {
      try {
        const addr = await energyTrading.participants(i);
        const m = await energyTrading.metricsOf(addr);
        

        // ---------- PAPER-EXACT SUSTAINABILITY SCORE ----------

// normalize metrics to [0,1]
const Ei = (Number(m.baseline) - Number(m.actual)) / Number(m.baseline);
const Pi = 1 - Number(m.peakReductionBps) / 10000;
const Fi = Number(m.powerFactorBps) / 10000;
const Ri = Number(m.renewableBps) / 10000;

// weights (must sum to 1)
const wE = 0.4;
const wP = 0.25;
const wF = 0.2;
const wR = 0.15;

// composite sustainability score
const Si =
  wE * Ei +
  wP * Pi +
  wF * Fi +
  wR * Ri;

// convert to basis points for uniformity
const scoreBps = Math.round(Si * 10000);

// push row
rows.push({
  address: addr,
  baseline: Number(m.baseline),
  actual: Number(m.actual),
  peak: Number(m.peakReductionBps),
  pf: Number(m.powerFactorBps),
  ren: Number(m.renewableBps),
  score: scoreBps,
});


        i++;
      } catch {
        break; // reached end
      }
    }

    setMetricsTable(rows);
  } catch (err) {
    console.error(err);
  }
};
const buildSimulatedRewardsFromScores = () => {
  if (metricsTable.length === 0) return [];

  // 1. Find max sustainability score
  const maxScore = Math.max(...metricsTable.map(r => r.score));

  // 2. Define total reward pool (same as contract uses)
  const TOTAL_REWARD = 1000; // ECO

  // 3. Build proportional rewards
  return metricsTable.map(r => {
    const ratio = r.score / maxScore;
    return {
      user: r.address,
      score: r.score,
      reward: (TOTAL_REWARD * ratio).toFixed(2),
      time: new Date().toLocaleString(),
      tx: "simulated",
      monthKey: new Date().toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      })
    };
  });
};



const fetchRewardHistory = async () => {
  if (!energyTrading) return;

  try {
    const filter = energyTrading.filters.RewardIssued();
    const logs = await energyTrading.queryFilter(filter, -5000);
    console.log("RewardIssued events:", logs.length);


    const rows = logs.map(l => {
  const date = new Date(Number(l.args.timestamp) * 1000);

  return {
    user: l.args.user,
    score: Number(l.args.score),
    reward: formatUnits(l.args.reward, 18),
    timestamp: date,
    monthKey: date.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    }),
    time: date.toLocaleString(),
    tx: l.transactionHash,
  };
}).reverse();

    setRewardHistory(rows);
  } catch (err) {
    console.error(err);
  }
};


  // ===== LOAD AUDIT LOGS =====
  const loadLogs = async () => {
    if (!auditLog) return;
    try {
      const allLogs = await auditLog.getAllLogs();
      const parsedLogs = allLogs.map((log) => ({
        buyer: log.buyer,
        seller: log.seller,
        amount: Number(log.amount),
        timestamp: new Date(Number(log.timestamp) * 1000).toLocaleString(),
      }));
      setLogs(parsedLogs);
    } catch (err) {
      console.error(err);
    }
  };

  // ===== EFFECTS =====
  useEffect(() => {
  if (!energyTrading || !account) return;

  const handler = (user, score, reward, ts) => {
    if (user.toLowerCase() === account.toLowerCase()) {
      alert(
        `🌱 Sustainability Reward!\n\n` +
        `You earned ${formatUnits(reward,18)} ECO\n` +
        `Score: ${(Number(score)/100).toFixed(2)}%\n` +
        `Date: ${new Date(Number(ts)*1000).toLocaleString()}`
      );
      fetchBalances();
    }
  };

  energyTrading.on("RewardIssued", handler);
  return () => energyTrading.off("RewardIssued", handler);
}, [energyTrading, account]);

  useEffect(() => {
    if (!energyTrading) return;
    loadOrders();
    loadProposals();
    const t = setInterval(() => {
      loadOrders();
      loadProposals();
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [energyTrading, weights]);

  // ===== DERIVED DATA =====
  const buyOrders = orders.filter(o => o.isBuy);
  const sellOrders = orders.filter(o => !o.isBuy);
  const myOrders = orders.filter(o => o.user?.toLowerCase() === account?.toLowerCase());

  const rewardsByMonth = useMemo(() => {
  const grouped = {};
  for (const r of rewardHistory) {
    if (!grouped[r.monthKey]) grouped[r.monthKey] = [];
    grouped[r.monthKey].push(r);
  }
  return grouped;
}, [rewardHistory]);

const currentMonthKey = new Date().toLocaleString("en-US", {
  month: "long",
  year: "numeric",
});

const rewardsIssuedThisMonth = useMemo(() => {
  return rewardHistory.some(r => r.monthKey === currentMonthKey);
}, [rewardHistory, currentMonthKey]);


  // join proposals with full order objects + score (UI recomputation for transparency)
  const proposalsWithDetail = useMemo(() => {
    const byId = new Map(orders.map(o => [o.id, o]));
    return proposals
      .map(p => {
        const b = byId.get(p.buyOrderId);
        const s = byId.get(p.sellOrderId);
        if (!b || !s) return null;

        // status fields come from matcher (booleans, plus finalized)
        const { buyerAccepted = false, sellerAccepted = false, finalized = false } = p;

        return {
          ...p,
          // keep original buyer/seller addresses from matcher
          buyerAddr: p.buyer,
          sellerAddr: p.seller,

          // enrich for UI calculation & hints
          buyer: b, seller: s,
          score: utilityScore(b, s, weights),
          autoReason: reasonFor(b, s),

          // status
          buyerAccepted,
          sellerAccepted,
          finalized,
        };
      })
      .filter(Boolean)
      .sort((a,b) => b.score - a.score);
  }, [proposals, orders, weights]);

  // filter proposals by role view
  const visibleProposals = useMemo(() => {
    if (roleView === "buyer") {
      return proposalsWithDetail.filter(p => p.buyer.user?.toLowerCase() === account?.toLowerCase());
    } else if (roleView === "seller") {
      return proposalsWithDetail.filter(p => p.seller.user?.toLowerCase() === account?.toLowerCase());
    }
    return proposalsWithDetail;
  }, [proposalsWithDetail, roleView, account]);

  // ====== STYLES ======
  const btn = (kind="primary") => ({
    primary: {
      background: "linear-gradient(90deg, var(--accent), var(--accent2))",
      color: "white", border: "none", padding: "10px 14px", borderRadius: 10, cursor: "pointer",
    },
    ghost: {
      background: "transparent",
      color: "var(--text)", border: "1px solid var(--stroke)", padding: "8px 12px", borderRadius: 10, cursor: "pointer",
    },
    warn: {
      background: "var(--warn)",
      color: "white", border: "none", padding: "8px 12px", borderRadius: 10, cursor: "pointer",
    }
  }[kind]);

  const input = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1px solid var(--stroke)", background: "var(--card)",
    color: "var(--text)", outline: "none"
  };

  const small = { fontSize: 12, color: "var(--muted)" };

  // ===== RENDER =====
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>
      {/* HEADER / STATUS BAR */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom: 16
      }}>
        <div style={{display:"flex", alignItems:"center", gap:12}}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg,#16a34a,#0ea5e9)"
          }}/>
          <div>
            <div style={{fontSize:18, fontWeight:700}}>Smart Energy Marketplace</div>
            <div style={small}>Green/Blue Theme • Utility-Driven Matching</div>
          </div>
          <Tag color="#16a34a">Connected: {account ? account.slice(0,6)+"…"+account.slice(-4) : "No"}</Tag>
          <Tag color="#10b981">Role: {roleView.toUpperCase()}</Tag>
          <Tag color="#0ea5e9">Orders: {orders.length || 0}</Tag>
          <Tag color="#6366f1">Proposals: {proposalsWithDetail.length || 0}</Tag>
        </div>

        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <button onClick={() => setThemeDark(d => !d)} style={btn("ghost")}>
            {themeDark ? "🌞 Light" : "🌙 Dark"}
          </button>
          {!account ? (
            <button onClick={connectWallet} style={btn("primary")}>Connect Wallet</button>
          ) : (
            <button onClick={() => navigator.clipboard.writeText(account)} style={btn("ghost")}>Copy Address</button>
          )}
        </div>
      </div>

      {account && (
        <>
          {/* ROLE TOGGLE */}
          <Card
            title={<>View Mode <Info text="Filters tables and proposals to the perspective you want to see." /></>}
            right={
              <div style={{display:"flex", gap:8}}>
                <button onClick={()=>setRoleView("buyer")} style={btn(roleView==="buyer"?"primary":"ghost")}>Buyer View</button>
                <button onClick={()=>setRoleView("seller")} style={btn(roleView==="seller"?"primary":"ghost")}>Seller View</button>
                <button onClick={()=>setRoleView("all")} style={btn(roleView==="all"?"primary":"ghost")}>All</button>
              </div>
            }
          >
            <div style={{...small}}>
              Buyer View shows proposals and orders where <b>you</b> are the buyer; Seller View does the same for selling; All shows everything.
            </div>
          </Card>

          {/* MY STATS + ADMIN */}
          <div style={{display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:16}}>
            <Card
              title={<>My Stats <Info text="Quickly check your token balances." /></>}
              right={<div style={{display:"flex", gap:8}}>
                
                <button onClick={fetchBalances} style={btn("ghost")}>Balances</button>
              </div>}
            >


             <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
  
  <div>
    <div style={small}>ETK Balance</div>
    <div style={{fontSize:20}}>
      {balanceETK ?? "—"}
    </div>
  </div>

  <div>
    <div style={small}>ECO Balance</div>
    <div style={{fontSize:20}}>
      {balanceECO ?? "—"}
    </div>
  </div>

</div>

            </Card>

            {account?.toLowerCase() === adminAddress.toLowerCase() && (
  <Card title="Admin Controls — Reward Epoch Management">
    <button
  onClick={distributeRewards}
  disabled={rewardsIssuedThisMonth}
  style={{
    background: rewardsIssuedThisMonth
      ? "#1a1a1a50"
      : "linear-gradient(90deg, var(--accent), var(--accent2))",
    color: "white",
    border: "none",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: rewardsIssuedThisMonth ? "not-allowed" : "pointer",
    fontWeight: 600,
  }}
>
  {rewardsIssuedThisMonth
    ? "Rewards Already Distributed This Month"
    : "Distribute Sustainability Rewards"}
</button>


    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
      Rewards are distributed once per month and are proportional to sustainability scores.
    </div>
  </Card>
)}

          </div>

          {/* PLACE ORDER */}
          <Card
            title={<>Post Order <Info text="Create buy or sell offers with time window and TTL (lifetime) for realistic marketplace flow." /></>}
            right={
              <div style={{display:"flex", gap:8}}>
                <button onClick={()=>setIsBuy(true)} style={btn(isBuy?"primary":"ghost")}>🟢 Buy</button>
                <button onClick={()=>setIsBuy(false)} style={btn(!isBuy?"primary":"ghost")}>🔴 Sell</button>
              </div>
            }
          >
            <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:12}}>
              <div>
                <div style={small}>Amount (units)</div>
                <input style={input} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="e.g. 10" />
              </div>
              <div>
                <div style={small}>Price / unit</div>
                <input style={input} value={price} onChange={e=>setPrice(e.target.value)} placeholder="e.g. 1.5" />
                {priceHint && (
                  <div style={{marginTop:6, fontSize:12, color: priceHint.tone==="warn" ? "var(--bad)" : priceHint.tone==="soft" ? "var(--warn)" : "var(--accent)"}}>
                    {priceHint.text}
                  </div>
                )}
              </div>
              <div>
                <div style={small}>Location ID</div>
                <input style={input} value={locationId} onChange={e=>setLocationId(e.target.value)} placeholder="e.g. 1" />
              </div>
              <div>
                <div style={small}>Order Lifetime (TTL)</div>
                <input
                  style={{...input, background:"#1a1a1a40", cursor:"not-allowed"}}
                  value={
                    startDate && startTime && endDate && endTime
                      ? `${Math.floor((toUnix(endDate,endTime) - toUnix(startDate,startTime)) / 60)} minutes`
                      : "Select start & end time"
                  }
                  readOnly
                />
              </div>
              <div>
                <div style={small}>Start Date</div>
                <input type="date" style={input} value={startDate} onChange={e=>setStartDate(e.target.value)} />
              </div>
              <div>
                <div style={small}>Start Time</div>
                <input type="time" style={input} value={startTime} onChange={e=>setStartTime(e.target.value)} />
              </div>
              <div>
                <div style={small}>End Date</div>
                <input type="date" style={input} value={endDate} onChange={e=>setEndDate(e.target.value)} />
              </div>
              <div>
                <div style={small}>End Time</div>
                <input type="time" style={input} value={endTime} onChange={e=>setEndTime(e.target.value)} />
              </div>
            </div>
            <div style={{display:"flex", gap:10}}>
              <button onClick={placeOrder} style={btn("primary")}>Post {isBuy ? "Buy" : "Sell"} Order</button>
              <button onClick={loadOrders} style={btn("ghost")}>Refresh Orders</button>
            </div>
          </Card>

          {/* WEIGHTS */}
          {isAdmin && (
          <Card title={<>Matcher Weights <Info text="Tune the importance of price spread, proximity, quantity fill, and time overlap for ranking proposals." /></>}>
            <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12}}>
              {["w1","w2","w3","w4"].map((k, idx) => (
                <div key={k}>
                  <div style={{display:"flex", justifyContent:"space-between"}}>
                    <div style={small}>{["Price Spread","Location","Quantity Fill","Time Overlap"][idx]}</div>
                    <div style={small}>{weights[k].toFixed(2)}</div>
                  </div>
                  <input
                    type="range"
                    min="0" max="1" step="0.05"
                    value={weights[k]}
                    onChange={e=>setWeights(w => ({...w, [k]: Number(e.target.value)}))}
                    style={{width:"100%"}}
                  />
                </div>
              ))}
            </div>
            <div style={{marginTop:8, ...small}}>
              Tip: Keep total near 1.0 (not enforced) — current sum: {(weights.w1+weights.w2+weights.w3+weights.w4).toFixed(2)}
            </div>
          </Card>
          )}

          {!isAdmin && (
  <Card title="Matching Policy">
    <div style={{ fontSize: 14, color: "var(--muted)" }}>
      Matching weights are defined by the system administrator.
    </div>

    <ul style={{ marginTop: 8 }}>
      <li>Price Spread: {weights.w1}</li>
      <li>Location Proximity: {weights.w2}</li>
      <li>Quantity Match: {weights.w3}</li>
      <li>Time Overlap: {weights.w4}</li>
    </ul>
  </Card>
)}


          {/* MARKET TABLES */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
            <Card title={<>Buy Orders <Info text="All current buy offers. Buyer View filters this to your orders." /></>}>
              <TableOrders
                rows={roleView==="buyer" ? buyOrders.filter(o=>o.user?.toLowerCase()===account?.toLowerCase()) : buyOrders}
              />
            </Card>
            <Card title={<>Sell Orders <Info text="All current sell offers. Seller View filters this to your orders." /></>}>
              <TableOrders
                rows={roleView==="seller" ? sellOrders.filter(o=>o.user?.toLowerCase()===account?.toLowerCase()) : sellOrders}
              />
            </Card>
          </div>

          {/* MY ORDERS */}
          <Card title={<>My Orders <Info text="A quick view of orders you placed (both sides)." /></>}>
            <TableOrders rows={myOrders}/>
          </Card>

          {/* PROPOSALS — HEADER ONLY (table component comes in PART 3) */}
          <Card
            title={<>Proposed Matches <Info text="Off-chain matcher suggestions ranked by your sliders, with live acceptance status." /></>}
            right={<div style={{display:"flex", gap:8}}>
              <button onClick={loadProposals} style={btn("ghost")}>Refresh</button>
            </div>}
          >
            {loadingProposals ? <div>Loading proposals…</div> : (
              <TableProposals
                proposals={visibleProposals}
                onBuyerAccept={(bId,sId)=>tryAccept("buyer", bId, sId)}
                onSellerAccept={(bId,sId)=>tryAccept("seller", bId, sId)}
                me={account}
              />
            )}
          </Card>

          {/* AUDIT LOGS */}
          <Card
  title={<>Sustainability Scoreboard <Info text="All departments' green scores based on energy metrics." /></>}
  right={<button onClick={fetchAllMetrics} style={btn("ghost")}>Load</button>}
>
  <TableMetrics rows={metricsTable} />
</Card>

<Card
  title={<>Reward Leaderboard
    <Info text="Simulated proportional reward distribution based on composite sustainability scores." />
  </>}
>
  {simulatedRewards.length === 0 ? (
    <div style={{ color: "var(--muted)" }}>
      Load sustainability metrics to view simulated rewards.
    </div>
  ) : (
    <TableRewards rows={simulatedRewards} />
  )}
</Card>


          <Card title={<>Audit Logs <Info text="Historical settlements and system events." /></>}
            right={<button onClick={loadLogs} style={btn("ghost")}>Load</button>}
          >
            {logs.length === 0 ? <div style={small}>No logs loaded.</div> : (
              <ul style={{margin:0, paddingLeft:16}}>
                {logs.map((log,i)=>(
                  <li key={i} style={{marginBottom:6}}>
                    <b>Buyer</b>: {log.buyer} • <b>Seller</b>: {log.seller} • <b>Amount</b>: {log.amount} ETK • <b>Time</b>: {log.timestamp}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {!account && (
        <Card title="Welcome">
          <div style={{marginBottom:10}}>
            Connect your wallet to view the marketplace, post orders, and see AI-ranked proposals.
          </div>
          <button onClick={connectWallet} style={btn("primary")}>Connect Wallet</button>
        </Card>
      )}
    </div>
  );
}

function TableMetrics({ rows }) {
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%", borderCollapse:"collapse"}}>
        <thead>
          <tr style={{textAlign:"left", fontSize:13, color:"var(--muted)"}}>
            <th style={{padding:"8px 6px"}}>Dept</th>
            <th style={{padding:"8px 6px"}}>Baseline</th>
            <th style={{padding:"8px 6px"}}>Actual</th>
            <th style={{padding:"8px 6px"}}>Drop%</th>
            <th style={{padding:"8px 6px"}}>Peak</th>
            <th style={{padding:"8px 6px"}}>PF</th>
            <th style={{padding:"8px 6px"}}>Renew.</th>
            <th style={{padding:"8px 6px"}}>Score</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan="8" style={{padding:10, color:"var(--muted)"}}>No metrics set.</td></tr>
          )}

          {rows.map((r,i)=>(
            <tr key={i} style={{borderTop:"1px solid var(--stroke)"}}>
              <td style={{ padding: "8px 6px" }}>
  {addressToDept[r.address.toLowerCase()] ||
    `${r.address.slice(0, 6)}…${r.address.slice(-4)}`}
</td>

              <td style={{padding:"8px 6px"}}>{r.baseline}</td>
              <td style={{padding:"8px 6px"}}>{r.actual}</td>
              <td style={{padding:"8px 6px"}}>
                {((r.baseline-r.actual)*100/r.baseline).toFixed(1)}%
              </td>
              <td style={{padding:"8px 6px"}}>{(r.peak/100).toFixed(2)}%</td>
              <td style={{padding:"8px 6px"}}>{(r.pf/100).toFixed(2)}%</td>
              <td style={{padding:"8px 6px"}}>{(r.ren/100).toFixed(2)}%</td>
              <td style={{padding:"8px 6px", fontWeight:700}}>
                {(r.score/100).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRewards({ rows }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 13, color: "var(--muted)" }}>
            <th style={{ padding: "8px 6px" }}>Department</th>
            <th style={{ padding: "8px 6px" }}>Score</th>
            <th style={{ padding: "8px 6px" }}>Reward (ECO)</th>
            <th style={{ padding: "8px 6px" }}>Date</th>
            <th style={{ padding: "8px 6px" }}>Tx</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan="5" style={{ padding: 10, color: "var(--muted)" }}>
                No reward history.
              </td>
            </tr>
          )}

          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--stroke)" }}>
              <td style={{ padding: "8px 6px" }}>
                {addressToDept[r.user.toLowerCase()] ||
                  r.user.slice(0, 6) + "…"}
              </td>

              <td style={{ padding: "8px 6px" }}>
                {(r.score / 100).toFixed(2)}%
              </td>

              <td style={{ padding: "8px 6px" }}>
                {r.reward}
              </td>

              <td style={{ padding: "8px 6px" }}>
                {r.time}
              </td>

              <td style={{ padding: "8px 6px" }}>
                {r.tx.slice(0, 10)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}




/** ---------- Small Components ---------- */

function TableOrders({ rows }) {
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%", borderCollapse:"collapse"}}>
        <thead>
          <tr style={{textAlign:"left", fontSize:13, color:"var(--muted)"}}>
            <th style={{padding:"8px 6px"}}>ID</th>
            <th style={{padding:"8px 6px"}}>Side</th>
            <th style={{padding:"8px 6px"}}>User</th>
            <th style={{padding:"8px 6px"}}>Amount</th>
            <th style={{padding:"8px 6px"}}>Price</th>
            <th style={{padding:"8px 6px"}}>Loc</th>
            <th style={{padding:"8px 6px"}}>Start</th>
            <th style={{padding:"8px 6px"}}>End</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan="8" style={{padding:10, color:"var(--muted)"}}>No orders.</td></tr>
          )}
          {rows.map(o=>(
            <tr key={o.id} style={{borderTop:"1px solid var(--stroke)"}}>
              <td style={{padding:"8px 6px"}}>{o.id}</td>
              <td style={{padding:"8px 6px"}}>{o.isBuy ? "BUY" : "SELL"}</td>
              <td style={{padding:"8px 6px"}} title={o.user}>{o.user.slice(0,6)}…{o.user.slice(-4)}</td>
              <td style={{padding:"8px 6px"}}>{o.amount}</td>
              <td style={{padding:"8px 6px"}}>{o.pricePerUnit}</td>
              <td style={{padding:"8px 6px"}}>{o.locationId}</td>
              <td style={{padding:"8px 6px"}}>{new Date(o.startTime*1000).toLocaleString()}</td>
              <td style={{padding:"8px 6px"}}>{new Date(o.endTime*1000).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/** ---------- NEW PROPOSALS TABLE (FINAL) ---------- */

function TableProposals({ proposals, onBuyerAccept, onSellerAccept, me }) {

  const statusLabel = (p) => {
    if (p.finalized) return <span style={{color:"var(--accent)", fontWeight:700}}>Finalized ✔</span>;
    if (p.buyerAccepted && p.sellerAccepted) return <span style={{color:"var(--blue)", fontWeight:600}}>Both Accepted</span>;
    if (p.buyerAccepted) return <span style={{color:"var(--accent2)"}}>Buyer Accepted</span>;
    if (p.sellerAccepted) return <span style={{color:"var(--accent2)"}}>Seller Accepted</span>;
    return <span style={{color:"var(--muted)"}}>Pending</span>;
  };

  const renderAction = (p) => {
    // If matcher says buyer doesn't have ETK, block action and warn
if (p.buyerHasETK === false) {
  return <span style={{color:"var(--bad)"}}>Buyer lacks ETK</span>;
}

    if (p.finalized) {
      return <span style={{color:"var(--accent)", fontWeight:700}}>Done ✔</span>;
    }

    const isBuyer = p.buyer.user.toLowerCase() === me?.toLowerCase();
    const isSeller = p.seller.user.toLowerCase() === me?.toLowerCase();

    const buyerBtn = (
      <button
        disabled={p.buyerAccepted}
        onClick={() => onBuyerAccept(p.buyOrderId, p.sellOrderId)}
        style={{
          background: p.buyerAccepted ? "#1a1a1a50" : "var(--blue)",
          color:"white",
          border:"none",
          padding:"6px 10px",
          borderRadius:8,
          cursor: p.buyerAccepted ? "not-allowed" : "pointer"
        }}
      >
        {p.buyerAccepted ? "Accepted" : "Buyer Accept"}
      </button>
    );

    const sellerBtn = (
      <button
        disabled={p.sellerAccepted}
        onClick={() => onSellerAccept(p.buyOrderId, p.sellOrderId)}
        style={{
          background: p.sellerAccepted ? "#1a1a1a50" : "var(--accent)",
          color:"white",
          border:"none",
          padding:"6px 10px",
          borderRadius:8,
          cursor: p.sellerAccepted ? "not-allowed" : "pointer"
        }}
      >
        {p.sellerAccepted ? "Accepted" : "Seller Accept"}
      </button>
    );

    return (
      <div style={{display:"flex", gap:6}}>
        {isBuyer && buyerBtn}
        {isSeller && sellerBtn}
        {!isBuyer && !isSeller && <span style={{color:"var(--muted)"}}>—</span>}
      </div>
    );
  };


  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%", borderCollapse:"collapse"}}>
        <thead>
          <tr style={{textAlign:"left", fontSize:13, color:"var(--muted)"}}>
            <th style={{padding:"8px 6px"}}>Buyer</th>
            <th style={{padding:"8px 6px"}}>Seller</th>
            <th style={{padding:"8px 6px"}}>Qty</th>
            <th style={{padding:"8px 6px"}}>Price</th>
            <th style={{padding:"8px 6px"}}>Score</th>
            <th style={{padding:"8px 6px"}}>Reason</th>
            <th style={{padding:"8px 6px"}}>Status</th>
            <th style={{padding:"8px 6px"}}>Action</th>
          </tr>
        </thead>

        <tbody>
          {proposals.length === 0 && (
            <tr>
              <td colSpan="8" style={{padding:10, color:"var(--muted)"}}>
                No proposed matches yet.
              </td>
            </tr>
          )}

          {proposals.map((p, idx)=>(
            <tr key={idx} style={{borderTop:"1px solid var(--stroke)"}}>

              {/* BUYER */}
              <td style={{padding:"8px 6px"}} title={p.buyerAddr}>
                {p.buyerAddr.slice(0,6)}…{p.buyerAddr.slice(-4)}
              </td>

              {/* SELLER */}
              <td style={{padding:"8px 6px"}} title={p.sellerAddr}>
                {p.sellerAddr.slice(0,6)}…{p.sellerAddr.slice(-4)}
              </td>

              {/* QTY */}
              <td style={{padding:"8px 6px"}}>{p.amount}</td>

              {/* PRICE */}
              <td style={{padding:"8px 6px"}}>{Number(p.price).toFixed(6)}</td>

              {/* SCORE */}
              <td style={{padding:"8px 6px"}}>
                <b>{(p.scoreBps / 10000).toFixed(4)}</b>
              </td>

              {/* REASON */}
              <td style={{padding:"8px 6px"}}>
                <div style={{fontSize:12}}>{p.reason}</div>
                <div style={{fontSize:12, color:"var(--muted)"}}>AI: {p.autoReason}</div>
              </td>

              {/* STATUS */}
              <td style={{padding:"8px 6px"}}>
                {statusLabel(p)}
              </td>

              {/* ACTION */}
              <td style={{padding:"8px 6px"}}>
                {renderAction(p)}
              </td>

            </tr>
          ))}

        </tbody>
      </table>
    </div>
  );
}

