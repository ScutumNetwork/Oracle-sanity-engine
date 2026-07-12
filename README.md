# Oracle Sanity Engine

> **Open-source developer infrastructure tool & security public good**  
> Eliminate single-point-of-failure oracle exploits through multi-feed cross-validation, fixed-point variance math, timestamp validation, and automated circuit breakers.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Org](https://img.shields.io/badge/GitHub-ScutumNetwork-blue)](https://github.com/ScutumNetwork)

---

## Overview

The **Oracle Sanity Engine** is a production-grade, modular security framework that cross-references a **Primary Oracle** feed against a **Secondary/Fallback Oracle** feed. It uses strict fixed-point arithmetic to detect price divergence, validates feed freshness via timestamp checks, and triggers an on-chain circuit breaker when anomalies are detected — preventing flash-loan price manipulation, stale data crashes, and other oracle-based exploits.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Oracle Sanity Engine                      │
├──────────────┬───────────────────┬──────────────────────────┤
│  Contracts   │     Backend       │       Frontend            │
│  (Rust/WASM) │  (TypeScript)     │   (React + Tailwind)     │
├──────────────┼───────────────────┼──────────────────────────┤
│ • OmniCheck  │ • Fastify API     │ • Real-time dashboard     │
│ • Adapters   │ • WS Listener     │ • Health charts           │
│ • Circuit Brk│ • Webhook Alerts  │ • Admin override console  │
└──────────────┴───────────────────┴──────────────────────────┘
```

---

## Quick Start

### Prerequisites

- **Rust** (1.75+) with `wasm32-unknown-unknown` target
- **Node.js** (18+) with npm
- **OpenSSL** (for backend crypto utilities)

### 1. Clone & Install

```bash
git clone https://github.com/ScutumNetwork/oracle-sanity-engine.git
cd oracle-sanity-engine
npm install          # installs backend + frontend workspace deps
```

### 2. Build Contracts

```bash
rustup target add wasm32-unknown-unknown
npm run build:contracts
```

### 3. Run Tests

```bash
npm run test:contracts
```

### 4. Start Backend

```bash
npm run dev:backend   # Fastify API on :3000 + WebSocket listener
```

### 5. Start Frontend

```bash
npm run dev:frontend  # Vite dev server on :5173
```

---

## Repository Structure

```
oracle-sanity-engine/
├── contracts/                 # Core WASM/Rust smart-contract primitives
│   ├── src/
│   │   ├── lib.rs             # OmniCheck contract: consensus routing, fixed-point math, circuit breaker
│   │   ├── error.rs           # Custom OracleError enum states
│   │   └── adapters/          # Pluggable oracle interface traits
│   │       ├── mod.rs          # Adapter trait definition
│   │       └── chainlink.rs    # Example Chainlink adapter implementation
│   └── Cargo.toml
├── backend/                   # Off-chain indexing & webhook alert system
│   ├── src/
│   │   ├── index.ts           # Fastify API (dashboard data endpoints)
│   │   └── listener.ts        # 24/7 RPC event WebSocket listener & webhook router
│   ├── package.json
│   └── tsconfig.json
├── frontend/                  # Interactive security diagnostic dashboard
│   ├── src/
│   │   ├── App.tsx            # Real-time health charts & admin override console
│   │   ├── components/
│   │   │   ├── OracleHealthTable.tsx   # Live feed deviation table
│   │   │   ├── DeviationChart.tsx      # Historical deviation chart
│   │   │   ├── AdminOverridePanel.tsx  # Admin multi-sig override controls
│   │   │   ├── AlertFeed.tsx           # Real-time alert stream
│   │   │   └── StatusBadge.tsx         # Health status indicators
│   │   ├── hooks/
│   │   │   └── useOracleData.ts        # WebSocket data hook
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── package.json               # Root workspace config
├── .gitignore
└── README.md
```

---

## Core Concepts

### OmniCheck Contract

The `OmniCheck` struct is the heart of the system. Its `get_safe_price` method:

1. **Validates freshness** — checks both Primary and Fallback timestamps against a `max_staleness` window
2. **Computes deviation** — calculates basis-point variance between Primary and Fallback prices using safe `i128` fixed-point arithmetic
3. **Trips circuit breaker** — if deviation exceeds 500 bps (5%) or data is stale, panics with a descriptive error

### Pluggable Adapters

The `adapters/` directory defines a clean trait interface (`OracleAdapter`) that community contributors can implement to add support for any oracle network (Chainlink, Pyth, Band Protocol, TWAP, custom feeds, etc.).

### Off-Chain Monitoring

The backend runs a persistent WebSocket connection to the blockchain RPC, scanning for `ScutumNetwork` event signatures. When a circuit-breaker event fires on-chain, the listener instantly dispatches a webhook payload to configured alert channels (Slack, Telegram, PagerDuty, etc.).

### Admin Dashboard

The React frontend provides:
- Real-time deviation charts
- Live feed health table
- Admin multi-sig override console
- Streaming alert feed

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Adding a New Oracle Adapter

1. Create a new file in `contracts/src/adapters/` (e.g., `pyth.rs`)
2. Implement the `OracleAdapter` trait
3. Register it in `adapters/mod.rs`
4. Add a test verifying the adapter output against known values

### Adding a New Alert Channel

1. Add a handler function in `backend/src/listener.ts`
2. Implement the webhook payload format for your target service
3. Register the channel in the `ALERT_CHANNELS` array

---

## License

MIT © [ScutumNetwork](https://github.com/ScutumNetwork)
