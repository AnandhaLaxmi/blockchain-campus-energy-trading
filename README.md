# Blockchain-Based Smart Energy Trading and Incentive System for Campus Microgrids

A decentralized peer-to-peer energy trading platform enabling departments within a campus to buy and sell energy transparently using blockchain, with sustainability-driven incentive rewards.

>  **Published Paper:** [Blockchain-Based Smart Energy Trading and Incentive System for Campus Microgrids](https://ieeexplore.ieee.org/document/11486181) — IEEE Xplore

---

## Overview

Traditional campus energy management is centralized and lacks mechanisms for localized optimization or incentive-based conservation. This system proposes a hybrid on-chain/off-chain blockchain framework where departments can trade energy peer-to-peer, with rewards distributed based on sustainability performance rather than raw consumption.

Deployed and tested on the **Ethereum Sepolia Test Network** using real institutional energy data.

---

## Features

| Feature | Description |
|---|---|
| P2P Energy Trading | Departments place buy/sell orders with quantity, price, location, and time window |
| Off-chain Order Matching | Utility scoring model matches orders based on price, quantity, proximity, and time overlap |
| On-chain Settlement | All trades settled via smart contracts — trustless and atomic |
| Sustainability Scoring | Composite score based on energy reduction, peak-hour efficiency, power factor, and renewable contribution |
| EcoRewards (ECO) | ERC-20 incentive tokens minted and distributed proportionally based on sustainability scores |
| Audit Logging | All trades and reward events recorded immutably on-chain |

---

## System Architecture

A three-layer hybrid architecture:

- **Data Layer** — Real campus energy data (monthly + hourly) processed off-chain; only aggregated metrics submitted to blockchain
- **Blockchain Layer** — Ethereum smart contracts handle marketplace, settlement, incentives, and audit logging
- **Application Layer** — React frontend for departments to trade, view matches, check scores, and claim rewards

---

## Smart Contracts

| Contract | Purpose |
|---|---|
| `EnergyTrading.sol` | Core marketplace — manages buy/sell orders, partial fulfillment, TTL expiry, trade settlement |
| `EnergyToken.sol` | ERC-20 utility token (ETK) used as settlement currency |
| `EcoRewards.sol` | ERC-20 mintable reward token (ECO) distributed based on sustainability scores |
| `AuditLog.sol` | Immutable on-chain record of all completed trades and reward events |

---

## Tech Stack

- **Solidity** — Smart contract development
- **Hardhat** — Development, testing, and deployment framework
- **React** — Frontend application
- **Ethers.js** — Blockchain interaction from frontend
- **Node.js** — Off-chain matching engine and data processing
- **Ethereum Sepolia** — Test network deployment

---
## Repository Structure

```
blockchain-campus-energy-trading/
├── contracts/          # Solidity smart contracts
├── scripts/            # Deployment and data loading scripts
├── test/               # Contract test suite
├── energy-dapp/        # React frontend
│   └── src/
│       ├── abis/       # Contract ABIs for frontend
│       └── data/       # Institutional energy data (excluded for privacy)
├── energytradingv1.md  # Research paper
├── hardhat.config.js
└── README.md
```
---

> **Note:** Institutional campus energy consumption data has been excluded from this repository for privacy. The system was validated using real operational data from SSN College of Engineering, Chennai.

---

## Sustainability Score Formula

For each department *i*:

**S_i = w_E·E_i + w_P·P_i + w_F·F_i + w_R·R_i**

Where:
- **E_i** — Energy reduction vs baseline
- **P_i** — Peak-hour efficiency
- **F_i** — Power factor contribution  
- **R_i** — Renewable energy usage

Weights are configurable to reflect institutional priorities.

---

## Acknowledgements

Built at the Department of Electrical and Electronics Engineering, SSN College of Engineering, Chennai, under the Internally Funded Student Project (IFSP) scheme, SSN Trust.

**Authors:** Anandha Laxmi Senthilkumar, Leo Raju  
