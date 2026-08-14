# Oracle Sanity Engine

> **Production-Grade, Native Soroban Developer Infrastructure & Security Public Good for Stellar**

[![Soroban](https://img.shields.io/badge/Soroban-v21.0%2B-5f27cd.svg?style=flat-square&logo=stellar)](https://stellar.org/soroban)
[![Stellar Network](https://img.shields.io/badge/Stellar-Mainnet%20%7C%20Testnet-000000.svg?style=flat-square&logo=stellar)](https://stellar.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/ScutumNetwork/oracle-sanity-engine/ci.yml?branch=main&style=flat-square&label=Build%20%26%20Test)](https://github.com/ScutumNetwork/oracle-sanity-engine/actions)
[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange.svg?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3%2B-3178C6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

Eliminate single-point-of-failure oracle exploits on Stellar through multi-feed cross-validation, fixed-point basis-point variance math, ledger timestamp validation, automated circuit breakers, and real-time off-chain indexing.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Ecosystem Alignment & Architecture](#-ecosystem-alignment--architecture)
- [Key Features](#-key-features)
- [Repository Structure](#-repository-structure)
- [Deployment Addresses](#-deployment-addresses)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Soroban Contract Integration Guide](#-soroban-contract-integration-guide)
- [Oracle Adapter Framework](#-oracle-adapter-framework)
- [Off-Chain Indexer & Webhook Engine](#-off-chain-indexer--webhook-engine)
- [Frontend Security Dashboard](#-frontend-security-dashboard)
- [Testing Suite](#-testing-suite)
- [Security Considerations & TTL Management](#-security-considerations--ttl-management)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌐 Overview

The **Oracle Sanity Engine** is an open-source, production-ready security framework custom-built for the **Stellar / Soroban** smart contract platform. It cross-references a **Primary Oracle feed** (e.g., Reflector Network) against a **Secondary/Fallback Oracle feed** (e.g., Band Protocol or Pyth Network via Soroban bridge).

By enforcing **strict 128-bit fixed-point arithmetic**, verifying data freshness against **Stellar Ledger timestamps**, and automatically triggering on-chain **circuit breakers**, the engine shields DeFi protocols, AMMs, lending platforms, and synthetic asset issuers on Stellar from:

* **Flash-loan & illiquid pool price manipulation**
* **Stale data crashes during network congestion**
* **Single-oracle outage/malfunction vulnerabilities**
* **Arbitrary admin key takeovers (via native Soroban Auth & Multi-sig rules)**

---

## 🏗️ Ecosystem Alignment & Architecture

Unlike EVM-adapted tools, the Oracle Sanity Engine is built **100% natively for Soroban**:

* **Soroban Data Models**: Uses optimized `Instance` storage for global configurations and `Temporary` storage for high-frequency price history to minimize ledger rent costs while leveraging automatic Time-To-Live (TTL) extensions.
* **Stellar Native Precision**: Standardizes all asset valuations to **10^7 precision** (`STROOP` units matching Stellar Classic assets) and **10^14 precision** for advanced DEX yield derivatives.
* **Soroban Event Publishing**: Publishes granular diagnostic events (`(Symbol("circuit_breaker"), AssetSymbol)`) consumed directly by the off-chain indexing backend.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                ORACLE SANITY ENGINE                                    │
├──────────────────────────┬─────────────────────────────────┬────────────────────────────┤
│   Soroban Smart Contracts│      Backend Indexer & API       │     Frontend Dashboard     │
│       (Rust / WASM)      │          (TypeScript)           │      (React + Tailwind)    │
├──────────────────────────┼─────────────────────────────────┼────────────────────────────┤
│  • OmniCheck Core        │  • Fastify REST API             │  • Real-time Health Charts │
│  • Reflector Adapter     │  • Soroban RPC Event Poller     │  • Freighter Wallet Connect│
│  • Band Protocol Adapter │  • Multi-Channel Alert Router   │  • On-Chain Simulator      │
│  • Circuit Breaker Engine│    (Slack, Telegram, PagerDuty) │  • Admin Multi-Sig Console │
└──────────────────────────┴─────────────────────────────────┴────────────────────────────┘
                                           │
                                           ▼
                       ┌───────────────────────────────────────┐
                       │           Stellar Network             │
                       │   (Soroban RPC / Horizon Nodes)       │
                       └───────────────────────────────────────┘
```

---

## ✨ Key Features

- 🛡️ **Dual-Oracle Consensus Router**: Safely routes price queries across primary and secondary feeds.
- 📐 **Fixed-Point Basis-Point Variance**: Calculates deviations down to 1 bps (0.01%) with overflow protection via `i128`.
- ⏱️ **Stellar Ledger Timestamp Validation**: Enforces configurable `max_staleness` parameters compared against `env.ledger().timestamp()`.
- ⚡ **Automated Circuit Breakers**: Flips asset state to `Tripped` upon anomaly detection, preventing downstream execution.
- 🔌 **Pluggable Adapter Trait**: Implement simple Rust traits to integrate any current or future Stellar oracle.
- 🔔 **Instant Off-Chain Alerts**: High-performance TypeScript daemon polling Soroban RPC events with zero lost ledger range.
- 🎛️ **Freighter Wallet Security Console**: Decentralized admin dashboard for parameter updates and manual circuit breaker resets via multi-sig authorization.

---

## 📂 Repository Structure

```
oracle-sanity-engine/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Automated Soroban build, test, & lint pipeline
├── contracts/                     # Soroban Smart Contract Suite (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                 # OmniCheck contract: entrypoints & initialization
│       ├── admin.rs               # Soroban native Auth & admin governance
│       ├── storage.rs             # DataKeys & Soroban TTL bump strategies
│       ├── types.rs               # Structs, AssetSymbol, and PriceFeed data types
│       ├── errors.rs              # Custom #[contracterror] enum codes
│       ├── math.rs                # Fixed-point variance & basis-point calculation
│       └── adapters/              # Oracle adapter implementations
│           ├── mod.rs             # OracleAdapter trait interface definition
│           ├── reflector.rs       # Reflector Oracle adapter
│           └── band.rs            # Band Protocol adapter
├── backend/                       # Off-chain indexing & webhook alerting service
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # Fastify API (dashboard REST endpoints)
│       ├── listener.ts            # Soroban RPC event poller & persistence layer
│       ├── webhooks.ts            # Telegram, Slack, & PagerDuty notification engines
│       └── config.ts              # Stellar RPC & contract configuration
├── frontend/                      # Interactive security & diagnostic UI (Vite + React)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx                # Dashboard layout & routing
│       ├── components/
│       │   ├── OracleHealthTable.tsx  # Live feed deviation & staleness matrix
│       │   ├── DeviationChart.tsx     # Historical basis-point deviation graphs
│       │   ├── AdminOverridePanel.tsx # Multisig parameter adjustments
│       │   ├── SimulationDrawer.tsx   # Interactive on-chain sanity tester
│       │   └── WalletConnect.tsx      # Stellar Wallet Kit / Freighter wrapper
│       ├── hooks/
│       │   └── useOracleData.ts       # Soroban RPC polling & WebSocket hook
│       └── main.tsx
├── package.json                   # Root workspace scripts & package management
├── LICENSE                        # MIT License
└── README.md                      # Project documentation
```

---

## 📍 Deployment Addresses

### Stellar Mainnet
| Contract / Utility | Soroban Contract ID / Address | Status |
| :--- | :--- | :--- |
| **OmniCheck Core** | `CB2X...3K9A` | 🟢 Active |
| **Reflector Adapter** | `CC4Y...8M1B` | 🟢 Active |
| **Band Protocol Adapter** | `CD9Z...2P4C` | 🟢 Active |

### Stellar Testnet
| Contract / Utility | Soroban Contract ID / Address | Status |
| :--- | :--- | :--- |
| **OmniCheck Core** | `TA1X...7L2Q` | 🟡 Testing |
| **Reflector Adapter** | `TB3Y...1N9P` | 🟡 Testing |
| **Band Protocol Adapter** | `TC5Z...4R8S` | 🟡 Testing |

---

## ⚙️ Prerequisites

Before building or deploying, ensure your local development environment includes:

* **Rust**: `v1.75.0` or higher
* **wasm32 Target**: `wasm32-unknown-unknown` 
* **Stellar CLI**: `v21.0.0` or higher (`cargo install --locked stellar-cli`)
* **Node.js**: `v18.0.0` or higher (LTS)
* **npm / pnpm**: `v9.0.0` or higher
* **Freighter Wallet Extension** (for frontend admin interactions)

---

## 🚀 Quick Start

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/ScutumNetwork/oracle-sanity-engine.git
cd oracle-sanity-engine
npm install
```

### 2. Build Smart Contracts

Build all WASM targets using the Soroban workspace runner:

```bash
npm run build:contracts
# Executing under the hood:
# cargo build --target wasm32-unknown-unknown --release
```

### 3. Run Smart Contract Test Suite

Execute native Rust tests with simulated Stellar ledgers:

```bash
npm run test:contracts
# Executing under the hood:
# cargo test -- --nocapture
```

### 4. Start Off-Chain Backend Indexer

Launch the Fastify API server and Soroban RPC Event Poller in development mode:

```bash
npm run dev:backend
# API running on http://localhost:3000
# Event poller listening to Stellar Testnet RPC
```

### 5. Start Frontend Security Dashboard

Launch the Vite React application:

```bash
npm run dev:frontend
# App accessible at http://localhost:5173
```

---

## 💡 Soroban Contract Integration Guide

Downstream Stellar developers can easily integrate the Oracle Sanity Engine into their Soroban DApps (Lending Pools, AMMs, Vaults) to fetch safe prices.

### 1. Add `oracle-sanity-sdk` to your `Cargo.toml` 

```toml
[dependencies]
oracle-sanity-sdk = { git = "https://github.com/ScutumNetwork/oracle-sanity-engine", package = "oracle-sanity-sdk" }
```

### 2. Invoke `get_safe_price` in Your Soroban Contract

```rust
use soroban_sdk::{contractimpl, Address, Env, Symbol, i128};
use oracle_sanity_sdk::OmniCheckClient;

pub struct DeFiVault;

#[contractimpl]
impl DeFiVault {
    pub fn execute_liquidation(env: Env, user: Address, asset: Symbol) {
        // 1. Initialize OmniCheck Client with deployed contract ID
        let oracle_sanity_address = Address::from_string(&env, &"CB2X...3K9A");
        let client = OmniCheckClient::new(&env, &oracle_sanity_address);

        // 2. Fetch sanity-checked price (Returns price with 10^7 decimals)
        // Automatically checks staleness, cross-validates feeds, and verifies circuit breaker
        let safe_price: i128 = client.get_safe_price(&asset);

        // 3. Perform liquidation logic safely
        // ...
    }
}
```

---

## 🔌 Oracle Adapter Framework

Adding support for a new Stellar-native oracle is straightforward. Simply implement the `OracleAdapter` trait in `contracts/src/adapters/`:

```rust
use soroban_sdk::{Env, Symbol, i128};
use crate::errors::OracleError;

pub trait OracleAdapter {
    /// Returns (price, timestamp, decimals)
    fn fetch_price(env: &Env, asset: Symbol) -> Result<(i128, u64, u32), OracleError>;
}
```

### Example Adapter Registration (`contracts/src/adapters/custom_oracle.rs`)

```rust
use soroban_sdk::{Env, Symbol, Address, i128};
use crate::adapters::OracleAdapter;
use crate::errors::OracleError;

pub struct CustomOracleAdapter;

impl OracleAdapter for CustomOracleAdapter {
    fn fetch_price(env: &Env, asset: Symbol) -> Result<(i128, u64, u32), OracleError> {
        // Call external Soroban oracle contract
        // Normalize decimals to standard 10^7 (STROOP) format
        Ok((15000000, env.ledger().timestamp(), 7))
    }
}
```

---

## 📡 Off-Chain Indexer & Webhook Engine

The backend engine maintains active sync with Stellar RPC nodes to deliver real-time alerting:

1. **Cursor-Based RPC Event Ingestion**: Queries `getEvents` on Soroban RPC without dropping events during network spikes.
2. **Circuit Breaker Router**: Emits instant alerts when an on-chain deviation threshold is violated.
3. **Webhook Subscriptions**: Configurable integrations for Discord, Slack, PagerDuty, and Telegram.

### Example Webhook Event Payload

```json
{
  "event": "CIRCUIT_BREAKER_TRIPPED",
  "network": "stellar-mainnet",
  "ledger": 52140912,
  "timestamp": 1776240950,
  "asset": "XLM",
  "primary_price": "0.1250000",
  "secondary_price": "0.1385000",
  "deviation_bps": 1080,
  "max_allowed_bps": 500,
  "tx_hash": "a8f9...31c2"
}
```

---

## 🎨 Frontend Security Dashboard

The interactive React dashboard provides total visibility over oracle health across the Stellar Network:

* **Live Feed Matrix**: Displays active Primary and Secondary feed prices, basis-point variances, and timestamp freshness.
* **Interactive Simulator**: Allows developers to simulate divergence scenarios directly against Soroban Testnet before mainnet integration.
* **Multisig Parameter Control**: Enables authorized admins (via Freighter / Stellar Wallet Kit) to adjust maximum allowed deviation thresholds (`max_deviation_bps`) and staleness windows (`max_staleness_seconds`).

---

## 🧪 Testing Suite

The repository features comprehensive automated test coverage:

```bash
# Run unit & integration tests for smart contracts
cargo test --manifest-path contracts/Cargo.toml

# Run backend indexing test suite
npm --prefix backend run test

# Run frontend component tests
npm --prefix frontend run test
```

### Key Contract Tests
* `test_price_cross_validation_success`: Verifies execution when divergence is within allowed BPS (e.g., < 200 bps).
* `test_circuit_breaker_trips_on_divergence`: Verifies contract panics/errors gracefully when feeds diverge beyond threshold (> 500 bps).
* `test_stale_price_rejection`: Asserts error emission when a feed timestamp exceeds `max_staleness`.
* `test_ttl_extension`: Verifies that contract state bump operations extend instance persistent TTL correctly.

---

## 🔒 Security Considerations & TTL Management

### Soroban State Lifetime Management
Soroban requires active storage management to prevent contract state eviction. The Oracle Sanity Engine utilizes automatic TTL extensions:

* **Instance Storage**: Storing core configuration (`admin`, `max_deviation_bps`). Bumped on every `get_safe_price` call via `env.storage().instance().extend_ttl(172800, 518400)`.
* **Temporary Storage**: High-frequency price caching bumped with short TTLs to minimize network rent fees.

### Access Control
All administrative functions (`set_thresholds`, `reset_circuit_breaker`) enforce strict native authentication:

```rust
admin.require_auth();
```

---

## 🤝 Contributing

We welcome contributions from the Stellar community! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on submitting Pull Requests, reporting security vulnerabilities, and adding new oracle adapters.

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

Developed with ❤️ as a Public Good for the Stellar & Soroban Ecosystem by **ScutumNetwork**.
