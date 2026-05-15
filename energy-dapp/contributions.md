“A modular blockchain-based P2P energy trading system that integrates IoT oracles and an AI bidding engine to reduce grid import and peak load in campus microgrids.”

“A privacy-preserving AuditLog implementation using zk-proofs to hide per-user volumes while allowing verifiable aggregate energy auditing.”

“A comparative study of transaction cost and latency across Sepolia, Polygon testnet and Optimism for P2P energy trades at 100+ nodes.”


A. AI value experiment (controlled simulation)

Setup: 100 simulated prosumers, real-weather-based solar profiles.

Compare: (1) ML-optimized bidding vs (2) naive fixed-price matching.

Metrics: GridImportReduction, PeakLoadReduction, Participant cost savings.

Runs: Repeat each scenario 5 times, report mean ± std.

B. Scaling & chain comparison

Setup: same contracts deployed to Sepolia, Polygon testnet, Optimism testnet.

Compare: gas per trade, tx latency, failed txs under 100 simultaneous orders.

Metrics: TxLatency_ms, GasCost_PER_TRADE, Throughput (trades/sec).

C. Privacy cost experiment

Setup: AuditLog commit-reveal vs zk-proof based AuditLog.

Compare: proof generation time, verification gas, privacy leakage (qualitative).

Metrics: ProofTime_ms, VerificationGas, On-chain storage bytes.