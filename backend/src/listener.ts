// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Off-Chain Event Listener & Webhook Alert Router
//
// This module maintains a persistent WebSocket connection to the blockchain
// RPC endpoint and listens for `ScutumNetwork` contract event emissions.
//
// When a circuit-breaker event is detected on-chain, the listener:
//   1. Decodes the raw event payload (ABI-encoded log data).
//   2. Logs the deviation metrics and timestamps.
//   3. Routes a structured webhook payload to all configured alert channels
//      (Slack, Telegram, PagerDuty, etc.).
//
// # Architecture
//
//   RPC Node ──WebSocket──> listener.ts ──> Alert Channels
//                                │
//                                └──> In-memory event store
//                                     (queried by index.ts API)
// ---------------------------------------------------------------------------

import { ethers } from "ethers";

// ===========================================================================
// CONFIGURATION
// ===========================================================================

/**
 * Configuration for the blockchain event listener.
 *
 * Populate these values via environment variables. For local development,
 * create a `.env` file in the `backend/` directory (see `.env.example`).
 */
export interface ListenerConfig {
  /** WebSocket RPC endpoint URL (e.g., wss://mainnet.infura.io/ws/v3/YOUR_KEY). */
  rpcWsUrl: string;

  /** The `ScutumNetwork` contract address to monitor for events. */
  contractAddress: string;

  /**
   * Topic hash for the circuit-breaker event.
   *
   * This is keccak256("CircuitBreakerTripped(uint256,uint256,uint256,uint256,uint64,uint64)").
   * Replace with the actual event signature when deploying.
   */
  circuitBreakerEventTopic: string;

  /** Reconnect delay in milliseconds. */
  reconnectDelayMs: number;
}

/**
 * Default listener configuration.
 * Override via `process.env` in production.
 */
export const DEFAULT_LISTENER_CONFIG: ListenerConfig = {
  rpcWsUrl: process.env.RPC_WS_URL || "wss://eth-sepolia.g.alchemy.com/v2/demo",
  contractAddress:
    process.env.CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000",
  circuitBreakerEventTopic:
    process.env.CIRCUIT_BREAKER_EVENT_TOPIC ||
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  reconnectDelayMs: 5_000,
};

// ===========================================================================
// EVENT DATA TYPES
// ===========================================================================

/**
 * Structured representation of an on-chain circuit-breaker event.
 *
 * This data is what gets logged to the in-memory store and dispatched
 * via webhooks to alert channels.
 */
export interface CircuitBreakerEvent {
  /** Unique event identifier (txHash + logIndex). */
  id: string;

  /** Transaction hash that emitted the event. */
  txHash: string;

  /** Block number where the event was emitted. */
  blockNumber: number;

  /** The primary oracle price at the time of the trip. */
  primaryPrice: bigint;

  /** The fallback oracle price at the time of the trip. */
  fallbackPrice: bigint;

  /** The computed deviation in basis points. */
  deviationBps: bigint;

  /** The configured deviation threshold in basis points. */
  thresholdBps: bigint;

  /** Unix timestamp (seconds) of the primary feed. */
  primaryTimestamp: bigint;

  /** Unix timestamp (seconds) of the fallback feed. */
  fallbackTimestamp: bigint;

  /** The reason string emitted by the contract. */
  reason: string;

  /** ISO-8601 timestamp when the event was processed. */
  processedAt: string;
}

// ===========================================================================
// ALERT CHANNEL TYPES
// ===========================================================================

/** Supported alert channel types. */
export type AlertChannelType = "slack" | "telegram" | "webhook";

/** Configuration for a single alert channel. */
export interface AlertChannel {
  type: AlertChannelType;
  name: string; // Human-readable label (e.g., "Ops Slack", "Dev Telegram")
  webhookUrl: string;
  enabled: boolean;
}

/** Payload sent to webhook endpoints when a circuit breaker trips. */
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

/**
 * Configured alert channels.
 *
 * To add a new alert channel (e.g., Discord, PagerDuty, Opsgenie):
 *   1. Add an entry to this array.
 *   2. Implement the dispatch logic in `dispatchToChannel()`.
 */
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
// EVENT DECODING
// ===========================================================================

/**
 * Circuit-breaker event ABI fragment.
 *
 * Matches the Solidity event:
 *   event CircuitBreakerTripped(
 *       uint256 primaryPrice,
 *       uint256 fallbackPrice,
 *       uint256 deviationBps,
 *       uint256 thresholdBps,
 *       uint64  primaryTimestamp,
 *       uint64  fallbackTimestamp,
 *       string  reason
 *   );
 *
 * Adjust this ABI fragment to match the actual deployed contract.
 */
const CIRCUIT_BREAKER_EVENT_ABI = [
  "event CircuitBreakerTripped(uint256 primaryPrice, uint256 fallbackPrice, uint256 deviationBps, uint256 thresholdBps, uint64 primaryTimestamp, uint64 fallbackTimestamp, string reason)",
];

/**
 * Decodes a raw Ethereum log into a structured `CircuitBreakerEvent`.
 *
 * Uses ethers.js `Interface` for ABI-based decoding.
 *
 * @param log — The raw log object from the WebSocket provider.
 * @returns A structured `CircuitBreakerEvent` or `null` if decoding fails.
 */
function decodeCircuitBreakerEvent(
  log: ethers.Log
): CircuitBreakerEvent | null {
  try {
    const iface = new ethers.Interface(CIRCUIT_BREAKER_EVENT_ABI);
    const parsed = iface.parseLog({
      topics: [...log.topics],
      data: log.data,
    });

    if (!parsed || parsed.name !== "CircuitBreakerTripped") {
      return null;
    }

    const args = parsed.args;

    return {
      id: `${log.transactionHash}-${log.index}`,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      primaryPrice: BigInt(args.primaryPrice.toString()),
      fallbackPrice: BigInt(args.fallbackPrice.toString()),
      deviationBps: BigInt(args.deviationBps.toString()),
      thresholdBps: BigInt(args.thresholdBps.toString()),
      primaryTimestamp: BigInt(args.primaryTimestamp.toString()),
      fallbackTimestamp: BigInt(args.fallbackTimestamp.toString()),
      reason: args.reason,
      processedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[Listener] Failed to decode event log:", err);
    return null;
  }
}

// ===========================================================================
// ALERT DISPATCH
// ===========================================================================

/**
 * Formats a `CircuitBreakerEvent` into a human-readable Slack message payload.
 *
 * @param event — The decoded circuit-breaker event.
 * @returns A Slack-compatible message payload object.
 */
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
          { type: "mrkdwn", text: `*Tx Hash:*\n\`${event.txHash}\`` },
          { type: "mrkdwn", text: `*Block:*\n${event.blockNumber}` },
          {
            type: "mrkdwn",
            text: `*Deviation:*\n${event.deviationBps} bps (threshold: ${event.thresholdBps} bps)`,
          },
          {
            type: "mrkdwn",
            text: `*Primary Price:*\n${event.primaryPrice}`,
          },
          {
            type: "mrkdwn",
            text: `*Fallback Price:*\n${event.fallbackPrice}`,
          },
          { type: "mrkdwn", text: `*Reason:*\n${event.reason}` },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Processed at ${event.processedAt}`,
          },
        ],
      },
    ],
  };
}

/**
 * Formats a `CircuitBreakerEvent` into a Telegram message payload.
 */
function formatTelegramMessage(event: CircuitBreakerEvent): object {
  const message =
    `🚨 <b>Circuit Breaker Tripped</b>\n\n` +
    `<b>Tx Hash:</b> <code>${event.txHash}</code>\n` +
    `<b>Block:</b> ${event.blockNumber}\n` +
    `<b>Deviation:</b> ${event.deviationBps} bps (threshold: ${event.thresholdBps} bps)\n` +
    `<b>Primary Price:</b> ${event.primaryPrice}\n` +
    `<b>Fallback Price:</b> ${event.fallbackPrice}\n` +
    `<b>Reason:</b> ${event.reason}\n\n` +
    `<i>Processed at ${event.processedAt}</i>`;

  return {
    chat_id: process.env.TELEGRAM_CHAT_ID || "",
    text: message,
    parse_mode: "HTML",
  };
}

/**
 * Dispatches an alert payload to a specific channel.
 *
 * Each channel type has its own payload format. To add a new channel type:
 *   1. Add the `AlertChannelType` variant.
 *   2. Add the formatting function.
 *   3. Add a dispatch case here.
 *
 * @param channel — The alert channel to dispatch to.
 * @param event — The circuit-breaker event data.
 */
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
        timestamp: event.processedAt,
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

/**
 * Routes a circuit-breaker event to ALL enabled alert channels.
 *
 * Dispatches happen concurrently (fire-and-forget) so that a slow
 * webhook doesn't block other channels.
 *
 * @param event — The decoded circuit-breaker event.
 */
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

/**
 * Adds a circuit-breaker event to the in-memory store.
 *
 * Maintains a ring buffer of the most recent `MAX_EVENTS_STORED` events.
 *
 * @param event — The decoded circuit-breaker event.
 */
function storeEvent(event: CircuitBreakerEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS_STORED) {
    recentEvents.shift(); // Remove oldest event
  }
}

// ===========================================================================
// EVENT HANDLER
// ===========================================================================

/**
 * Handles an incoming raw log from the WebSocket subscription.
 *
 * 1. Decodes the ABI-encoded log data.
 * 2. Stores the structured event in memory.
 * 3. Logs the event details.
 * 4. Routes alerts to all configured channels.
 *
 * @param log — The raw Ethereum log object.
 */
async function handleLog(log: ethers.Log): Promise<void> {
  const event = decodeCircuitBreakerEvent(log);

  if (!event) {
    // Not a circuit-breaker event — ignore
    return;
  }

  console.log("\n========================================");
  console.log("🚨 CIRCUIT BREAKER TRIPPED");
  console.log("========================================");
  console.log(`  Tx Hash:        ${event.txHash}`);
  console.log(`  Block:          ${event.blockNumber}`);
  console.log(`  Primary Price:  ${event.primaryPrice}`);
  console.log(`  Fallback Price: ${event.fallbackPrice}`);
  console.log(`  Deviation:      ${event.deviationBps} bps`);
  console.log(`  Threshold:      ${event.thresholdBps} bps`);
  console.log(`  Reason:         ${event.reason}`);
  console.log(`  Processed At:   ${event.processedAt}`);
  console.log("========================================\n");

  // Persist to in-memory store for API queries
  storeEvent(event);

  // Dispatch alerts
  await routeAlerts(event);
}

// ===========================================================================
// WEBSOCKET CONNECTION MANAGER
// ===========================================================================

/**
 * Starts the persistent WebSocket event listener.
 *
 * Establishes a WebSocket connection to the RPC endpoint, subscribes to
 * logs emitted by the configured contract address matching the circuit-breaker
 * event topic. Automatically reconnects on disconnection.
 *
 * @param config — Listener configuration.
 * @returns A function that can be called to stop the listener.
 */
export function startEventListener(config: ListenerConfig): () => void {
  let provider: ethers.WebSocketProvider | null = null;
  let isStopped = false;

  async function connect(): Promise<void> {
    if (isStopped) return;

    try {
      console.log(
        `[Listener] Connecting to RPC: ${config.rpcWsUrl.replace(/\/\/.*@/, "//***@")}`
      );
      provider = new ethers.WebSocketProvider(config.rpcWsUrl);

      // Wait for the WebSocket to be ready
      await provider.ready;
      console.log("[Listener] WebSocket connected.");

      // ------------------------------------------------------------------
      // Subscribe to contract logs matching the circuit-breaker event topic
      //
      // We filter by:
      //   - address: the ScutumNetwork contract
      //   - topics[0]: the keccak256 hash of the event signature
      // ------------------------------------------------------------------
      const filter = {
        address: config.contractAddress,
        topics: [config.circuitBreakerEventTopic],
      };

      provider.on(filter, handleLog);

      console.log(
        `[Listener] Subscribed to events on ${config.contractAddress}`
      );

      // ------------------------------------------------------------------
      // Handle WebSocket disconnection gracefully
      // ------------------------------------------------------------------
      provider.websocket.onclose = () => {
        console.warn("[Listener] WebSocket closed. Reconnecting...");
        if (!isStopped) {
          setTimeout(connect, config.reconnectDelayMs);
        }
      };

      provider.websocket.onerror = (err) => {
        console.error("[Listener] WebSocket error:", err);
      };
    } catch (err) {
      console.error("[Listener] Connection failed:", err);
      if (!isStopped) {
        console.log(
          `[Listener] Retrying in ${config.reconnectDelayMs / 1000}s...`
        );
        setTimeout(connect, config.reconnectDelayMs);
      }
    }
  }

  // Start the connection
  connect();

  // Return a stop function
  return () => {
    isStopped = true;
    if (provider) {
      provider.destroy();
    }
    console.log("[Listener] Stopped.");
  };
}
