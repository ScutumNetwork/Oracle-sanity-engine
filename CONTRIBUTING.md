# Contributing to Oracle Sanity Engine

Thank you for your interest in contributing! This document outlines the process for contributing code, documentation, adapters, and alert channels to the Oracle Sanity Engine project.

## Code of Conduct

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, constructive, and inclusive.

---

## How to Contribute

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/oracle-sanity-engine.git
cd oracle-sanity-engine
npm install
```

### 2. Create a Branch

Use a descriptive branch name:

```bash
git checkout -b feat/add-pyth-adapter
git checkout -b fix/deviation-edge-case
git checkout -b docs/improve-readme
```

### 3. Make Your Changes

Follow the conventions in the relevant section below.

### 4. Write Tests

- **Contracts:** `cargo test` in the `contracts/` directory
- **Backend:** Tests should be added in `backend/src/__tests__/`
- **Frontend:** Tests should be added alongside components

### 5. Run the Full Check

```bash
npm run test:contracts   # Rust tests
npm run build:contracts  # WASM compilation check
cd backend && npm run build  # TypeScript compilation
cd frontend && npm run build # Frontend build
```

### 6. Submit a Pull Request

Open a PR against the `main` branch. Include:
- A clear description of what you're changing and why
- Reference any related issues
- Screenshots for UI changes
- Confirmation that all tests pass

---

## Adding a New Oracle Adapter

The oracle adapter framework is designed for extensibility. To add support for a new oracle network:

### 1. Create the Adapter Module

Create a new file in `contracts/src/adapters/` (e.g., `pyth.rs`):

```rust
use super::{OracleAdapter, OraclePrice};

pub struct PythAdapter {
    label: String,
}

impl PythAdapter {
    pub fn new(pair: &str) -> Self {
        Self {
            label: alloc::format!("Pyth {}", pair),
        }
    }
}

impl OracleAdapter for PythAdapter {
    fn feed_label(&self) -> &str {
        &self.label
    }

    fn get_price(&self, feed_id: &[u8]) -> OraclePrice {
        // 1. Decode the Pyth price feed ID from feed_id
        // 2. Perform the cross-contract call or host-function query
        // 3. Normalize the result into OraclePrice
        todo!("Implement Pyth price feed query")
    }
}
```

### 2. Register in `mod.rs`

Add to `contracts/src/adapters/mod.rs`:

```rust
pub mod pyth;  // Add this line
```

### 3. Write Tests

Add a test module in your adapter file verifying:
- Correct label formatting
- Price return values (with mock data)
- Edge cases (zero price, very large price)

### 4. Update Documentation

Add your adapter to the README's adapter list.

---

## Adding a New Alert Channel

### 1. Add the Channel Type

In `backend/src/listener.ts`, add your channel to the `AlertChannelType` union:

```typescript
export type AlertChannelType = "slack" | "telegram" | "webhook" | "discord";
```

### 2. Format the Payload

Add a formatting function:

```typescript
function formatDiscordMessage(event: CircuitBreakerEvent): object {
  return {
    content: `🚨 Circuit Breaker Tripped!`,
    embeds: [{ /* Discord embed format */ }],
  };
}
```

### 3. Add the Dispatch Case

In `dispatchToChannel`, add:

```typescript
case "discord":
  body = formatDiscordMessage(event);
  break;
```

### 4. Register in the Channels Array

```typescript
{
  type: "discord",
  name: "Discord Alerts",
  webhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
  enabled: !!process.env.DISCORD_WEBHOOK_URL,
},
```

### 5. Add the Env Variable

Update `backend/.env.example`:

```bash
DISCORD_WEBHOOK_URL=
```

---

## Adding a Frontend Dashboard Component

### 1. Create the Component

Place your component in `frontend/src/components/`:

```tsx
export function MyNewWidget() {
  const { events, stats } = useOracleData();
  // ...
}
```

### 2. Import into App.tsx

Add your component to the dashboard layout.

### 3. Use Consistent Styling

- Use the `card-glass` class for card containers
- Use the `font-mono` class for numeric data
- Use the severity color palette: `severity-safe`, `severity-warn`, `severity-danger`
- Use `StatusBadge` for health indicators

---

## Code Style Guidelines

### Rust (Contracts)
- `#![no_std]` compatibility is **mandatory**
- Use `alloc::` for heap types (String, Vec, etc.)
- Prefer `checked_*` arithmetic methods
- All public functions must have doc comments
- Keep adapter logic minimal — validation belongs in `OmniCheck`

### TypeScript (Backend)
- Use explicit types (no `any` unless necessary)
- Prefer `const` over `let` where possible
- Use `interface` for data shapes, `type` for unions
- All async operations should have error handling
- Log with descriptive prefixes: `[Listener]`, `[Server]`

### React (Frontend)
- Use functional components and hooks
- Keep components under 300 lines (extract sub-components)
- Use the `useOracleData` hook for data access
- Follow the established Tailwind utility class patterns
- All interactive elements must be keyboard-accessible

---

## Questions?

Open a [GitHub Discussion](https://github.com/ScutumNetwork/oracle-sanity-engine/discussions) or join our community channels.

---

Thank you for helping make DeFi safer! 🛡️
