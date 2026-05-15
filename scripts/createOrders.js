require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
    // 1️⃣ Setup provider and signer (v5 syntax)
    const provider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // 2️⃣ Connect to deployed contract
    const contractAddress = process.env.ENERGY_CONTRACT_ADDRESS;
    const abi = [
        "function placeOrder(bool isBuy,uint256 amount,uint256 pricePerUnit,uint256 locationId,uint256 startTime,uint256 endTime,uint256 ttlSeconds) external returns (uint256)"
    ];
    const market = new ethers.Contract(contractAddress, abi, wallet);

    console.log("Placing test orders...");

    const now = Math.floor(Date.now() / 1000);

    const orders = [
        { isBuy: true,  amount: 10, price: 1, loc: 1 },
        { isBuy: false, amount: 5,  price: 1, loc: 1 },
        { isBuy: true,  amount: 20, price: 2, loc: 2 },
        { isBuy: false, amount: 15, price: 2, loc: 2 },
    ];

    for (const o of orders) {
        const tx = await market.placeOrder(
            o.isBuy,
            o.amount,
            o.price,
            o.loc,
            now,
            now + 3600,
            3600
        );
        await tx.wait();
        console.log(`Order placed: ${o.isBuy ? "BUY" : "SELL"} ${o.amount} units at price ${o.price}, tx: ${tx.hash}`);
    }

    console.log("✅ All test orders placed successfully!");
}

main().catch(console.error);
