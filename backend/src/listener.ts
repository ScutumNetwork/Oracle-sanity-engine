// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Off-Chain Contract Poller & Webhook Alert Router
//
// This module polls the deployed Soroban contract and detects circuit-breaker
// trips. The OmniCheck contract does not emit EVM-style logs, so the poller
// simulates read-only contract calls (`is_locked`, `get_config`,
// `get_last_diagnostic`) against the Soroban RPC on a fixed interval.
//
// When a transition from "unlocked" to "locked" is observed, the poller:
//   1. Derives the trip reason from the stored diagnostic (OracleError code).
//   2. Logs the trip details.
//   3. Routes a structured webhook payload to all configured alert channels
//      (Slack, Telegram, generic webhook, etc.).
//
// # Architecture
//
//   Soroban RPC ──poll──> listener.ts ──> Alert Channels
//                              │
//                              └──> In-memory event store
//                                   (queried by index.ts API)
// ---------------------------------------------------------------------------

import {
  rpc,
  Contract,
  Account,
  TransactionBuilder,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// ===========================================================================
// CONFIGURATION
// ===========================================================================

/** Configuration for the Soroban contract poller. */
export interface ListenerConfig {
  /** Soroban RPC HTTP endpoint (e.g. https://soroban-testnet.stellar.org). */
  rpcUrl: string;

  /** The deployed OmniCheck contract ID to monitor. */
  contractId: string;

  /** Stellar network passphrase used for transaction simulation. */
  networkPassphrase: string;

  /** Poll interval in milliseconds. */
  pollIntervalMs: number;
}

const parsedPollInterval = Number(process.env.POLL_INTERVAL_MS);

/** Default poller configuration, overridable via `process.env`. */
export const DEFAULT_LISTENER_CONFIG: ListenerConfig = {
  rpcUrl: process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
  contractId:
    process.env.CONTRACT_ID ||
    "CB5HM7AHEDTQIEG6CBBGQZHWS63REXOHCAONZEMHS65QQ2XU7OY2APS5",
  networkPassphrase:
    process.env.NETWORK_PASSPHRASE || "Test SDF Network ; September 2015",
  pollIntervalMs:
    Number.isFinite(parsedPollInterval) && parsedPollInterval > 0
      ? parsedPollInterval
      : 30_000,
};

// ===========================================================================
// EVENT DATA TYPES
// ===========================================================================

/** Structured representation of an on-chain circuit-breaker trip. */
export interface CircuitBreakerEvent {
  /** Unique event identifier. */
  id: string;

  /** Human-readable reason for the trip (derived from the error code). */
  reason: string;

  /** Numeric `OracleError` code reported by the contract (1-9). */
  reasonCode: number;

  /** Configured deviation threshold in basis points at detection time. */
  deviationThresholdBps: number;

  /** Configured max staleness in seconds at detection time. */
  maxStalenessSecs: number;

  /** ISO-8601 timestamp when the trip was detected. */
  detectedAt: string;
}

// ===========================================================================
// ALERT CHANNEL TYPES
// ===========================================================================

/** Supported alert channel types. */
export type AlertChannelType = "slack" | "telegram" | "webhook";

/** Configuration for a single alert channel. */
export interface AlertChannel {
  type: AlertChannelType;
  name: string;
  webhookUrl: string;
  enabled: boolean;
}

/** Payload sent to webhook endpoints when the circuit breaker trips. */
export interface AlertPayload {
  event: "CIRCUIT_BREAKER_TRIPPED";
  severity: "CRITICAL";
  timestamp: string;
  data: CircuitBreakerEvent;
}

// ===========================================================================
// IN-MEMORY EVENT STORE (SHARED WITH index.ts API)
// ===========================================================================

/** Maximum number of recent events to keep in memory. */
const MAX_EVENTS_STORED = 1000;

/** In-memory ring buffer of recent circuit-breaker events. */
export const recentEvents: CircuitBreakerEvent[] = [];

// ===========================================================================
// ALERT CHANNELS REGISTRY
// ===========================================================================

/** Configured alert channels (driven by environment variables). */
export const ALERT_CHANNELS: AlertChannel[] = [
  {
    type: "slack",
    name: "Slack Alerts",
    webhookUrl: process.env.SLACK_WEBHOOK_URL || "",
    enabled: !!process.env.SLACK_WEBHOOK_URL,
  },
  {
    type: "telegram",
    name: "Telegram Alerts",
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || "",
    enabled: !!process.env.TELEGRAM_WEBHOOK_URL,
  },
  {
    type: "webhook",
    name: "Generic Webhook",
    webhookUrl: process.env.GENERIC_WEBHOOK_URL || "",
    enabled: !!process.env.GENERIC_WEBHOOK_URL,
  },
];

// ===========================================================================
// ORACLE ERROR REASON MAPPING
// ===========================================================================

/** Maps the contract's `OracleError` numeric codes to human-readable reasons. */
const ORACLE_ERROR_REASONS: Record<number, string> = {
  1: "Feeds diverged beyond threshold",
  2: "Primary feed stale",
  3: "Fallback feed stale",
  4: "Invalid price",
  5: "Timestamp in future",
  6: "Unauthorized",
  7: "Invalid config",
  8: "Circuit breaker tripped",
  9: "Not initialized",
};

// ===========================================================================
// SOROBAN READ HELPERS
// ===========================================================================

/** Dummy account used for read-only simulation (does not need funding). */
const DUMMY_ACCOUNT =
  "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNM5";

/** Unwraps a Soroban `Result<T, E>` from `scValToNative`. */
function unwrapResult(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "ok" in raw) {
    return (raw as { ok: unknown }).ok;
  }
  if (raw && typeof raw === "object" && "error" in raw) {
    throw new Error(
      `Contract returned error code: ${(raw as { error: unknown }).error}`
    );
  }
  return raw;
}

/** Coerces a Soroban-decoded integer (`bigint`) into a JS `number`. */
function toNumber(value: unknown): number {
  if (typeof value === "bigint" || typeof value === "number") {
    return Number(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * Calls a Soroban contract function via simulation and returns the decoded
 * native value.
 */
async function simulateCall(
  server: rpc.Server,
  contractId: string,
  functionName: string,
  networkPassphrase: string
): Promise<unknown> {
  const contract = new Contract(contractId);
  const op = contract.call(functionName);

  const tx = new TransactionBuilder(new Account(DUMMY_ACCOUNT, "0"), {
    fee: "0",
    networkPassphrase,
  })
    .addOperation(op as xdr.Operation)
    .setTimeout(30)
    .build();

  const response = await server.simulateTransaction(tx);

  if ("error" in response && response.error) {
    throw new Error(`Simulation failed for ${functionName}: ${response.error}`);
  }

  const simResult = response as { result?: { retval: xdr.ScVal } };
  if (!simResult.result?.retval) {
    throw new Error(`No result from simulation for ${functionName}`);
  }

  return scValToNative(simResult.result.retval);
}

// ===========================================================================
// ALERT DISPATCH
// ===========================================================================

/** Formats a `CircuitBreakerEvent` into a Slack message payload. */
function formatSlackMessage(event: CircuitBreakerEvent): object {
  return {
    text: "🚨 *Oracle Sanity Engine — Circuit Breaker Tripped*",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 Circuit Breaker Tripped",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Reason:*\n${event.reason}` },
          { type: "mrkdwn", text: `*Reason Code:*\n${event.reasonCode}` },
          {
            type: "mrkdwn",
            text: `*Threshold:*\n${event.deviationThresholdBps} bps`,
          },
          {
            type: "mrkdwn",
            text: `*Max Staleness:*\n${event.maxStalenessSecs}s`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Detected at ${event.detectedAt}` },
        ],
      },
    ],
  };
}

/** Formats a `CircuitBreakerEvent` into a Telegram message payload. */
function formatTelegramMessage(event: CircuitBreakerEvent): object {
  const message =
    `🚨 <b>Circuit Breaker Tripped</b>\n\n` +
    `<b>Reason:</b> ${event.reason}\n` +
    `<b>Reason Code:</b> ${event.reasonCode}\n` +
    `<b>Threshold:</b> ${event.deviationThresholdBps} bps\n` +
    `<b>Max Staleness:</b> ${event.maxStalenessSecs}s\n\n` +
    `<i>Detected at ${event.detectedAt}</i>`;

  return {
    chat_id: process.env.TELEGRAM_CHAT_ID || "",
    text: message,
    parse_mode: "HTML",
  };
}

/** Dispatches an alert payload to a single channel. */
async function dispatchToChannel(
  channel: AlertChannel,
  event: CircuitBreakerEvent
): Promise<void> {
  if (!channel.enabled || !channel.webhookUrl) {
    return;
  }

  let body: object;

  switch (channel.type) {
    case "slack":
      body = formatSlackMessage(event);
      break;
    case "telegram":
      body = formatTelegramMessage(event);
      break;
    case "webhook":
    default:
      body = {
        event: "CIRCUIT_BREAKER_TRIPPED",
        severity: "CRITICAL",
        timestamp: event.detectedAt,
        data: event,
      } satisfies AlertPayload;
      break;
  }

  try {
    const response = await fetch(channel.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(
        `[Listener] Alert dispatch to ${channel.name} (${channel.type}) failed: HTTP ${response.status}`
      );
    } else {
      console.log(
        `[Listener] Alert dispatched to ${channel.name} (${channel.type})`
      );
    }
  } catch (err) {
    console.error(
      `[Listener] Alert dispatch to ${channel.name} (${channel.type}) failed:`,
      err
    );
  }
}

/** Routes a circuit-breaker event to all enabled alert channels. */
export async function routeAlerts(event: CircuitBreakerEvent): Promise<void> {
  const enabledChannels = ALERT_CHANNELS.filter((ch) => ch.enabled);

  if (enabledChannels.length === 0) {
    console.warn(
      "[Listener] No alert channels configured. Event will be logged but not dispatched."
    );
    return;
  }

  console.log(
    `[Listener] Dispatching alert to ${enabledChannels.length} channel(s)...`
  );

  await Promise.allSettled(
    enabledChannels.map((channel) => dispatchToChannel(channel, event))
  );
}

// ===========================================================================
// EVENT PERSISTENCE
// ===========================================================================

/** Adds a circuit-breaker event to the in-memory store. */
function storeEvent(event: CircuitBreakerEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS_STORED) {
    recentEvents.shift();
  }
}

// ===========================================================================
// EVENT HANDLER
// ===========================================================================

/** Handles a newly-detected circuit-breaker trip. */
async function handleTrip(event: CircuitBreakerEvent): Promise<void> {
  console.log("\n========================================");
  console.log("🚨 CIRCUIT BREAKER TRIPPED");
  console.log("========================================");
  console.log(`  Reason:        ${event.reason}`);
  console.log(`  Reason Code:   ${event.reasonCode}`);
  console.log(`  Threshold:     ${event.deviationThresholdBps} bps`);
  console.log(`  Max Staleness: ${event.maxStalenessSecs}s`);
  console.log(`  Detected At:   ${event.detectedAt}`);
  console.log("========================================\n");

  storeEvent(event);
  await routeAlerts(event);
}

// ===========================================================================
// POLLER
// ===========================================================================

/**
 * Starts the Soroban contract poller.
 *
 * Polls the contract on `config.pollIntervalMs`, detects transitions from
 * "unlocked" to "locked", and emits a `CircuitBreakerEvent` on each trip.
 *
 * @param config — Poller configuration.
 * @returns A function that stops the poller.
 */
export function startEventListener(config: ListenerConfig): () => void {
  const server = new rpc.Server(config.rpcUrl);
  let wasLocked = false;
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll(): Promise<void> {
    if (stopped || inFlight) return;
    inFlight = true;

    try {
      const [lockedRaw, configRaw, diagnosticRaw] = await Promise.all([
        simulateCall(
          server,
          config.contractId,
          "is_locked",
          config.networkPassphrase
        ),
        simulateCall(
          server,
          config.contractId,
          "get_config",
          config.networkPassphrase
        ),
        simulateCall(
          server,
          config.contractId,
          "get_last_diagnostic",
          config.networkPassphrase
        ),
      ]);

      const isLocked = lockedRaw === true;
      const contractConfig = unwrapResult(configRaw) as {
        deviation_threshold_bps: unknown;
        max_staleness_secs: unknown;
      };
      const deviationThresholdBps = toNumber(
        contractConfig.deviation_threshold_bps
      );
      const maxStalenessSecs = toNumber(contractConfig.max_staleness_secs);
      const reasonCode = diagnosticRaw == null ? 0 : toNumber(diagnosticRaw);

      // Detect the unlocked -> locked transition.
      if (isLocked && !wasLocked) {
        const event: CircuitBreakerEvent = {
          id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          reason:
            ORACLE_ERROR_REASONS[reasonCode] || `Unknown (code ${reasonCode})`,
          reasonCode,
          deviationThresholdBps,
          maxStalenessSecs,
          detectedAt: new Date().toISOString(),
        };
        await handleTrip(event);
      }

      wasLocked = isLocked;
    } catch (err) {
      console.error("[Listener] Poll failed:", err);
    } finally {
      inFlight = false;
    }
  }

  console.log(
    `[Listener] Polling contract ${config.contractId} every ${config.pollIntervalMs}ms via ${config.rpcUrl}`
  );

  void poll();
  timer = setInterval(() => void poll(), config.pollIntervalMs);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    console.log("[Listener] Stopped.");
  };
}
