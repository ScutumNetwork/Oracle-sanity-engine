// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Fastify API Server
//
// This module provides the REST & WebSocket API layer for the diagnostic
// dashboard. It:
//
//   1. Serves real-time oracle health data via REST endpoints.
//   2. Exposes an admin endpoint for multi-sig override operations.
//   3. Provides a WebSocket endpoint for streaming live event updates
//      to the frontend dashboard.
//
// # Endpoints
//
//   GET  /api/health              — Health check
//   GET  /api/events              — Recent circuit-breaker events
//   GET  /api/events/:id          — Single event by ID
//   GET  /api/stats               — Aggregate statistics
//   POST /api/admin/override      — Admin multi-sig override (mock)
//   WS   /ws                      — Real-time event stream
//
// # Running
//
//   npm run dev     # Development with hot-reload
//   npm run build   # Compile TypeScript
//   npm start       # Run compiled server
// ---------------------------------------------------------------------------

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config as dotenvConfig } from "dotenv";

// Load environment variables from .env file (if present)
dotenvConfig();

import {
  startEventListener,
  recentEvents,
  DEFAULT_LISTENER_CONFIG,
  type CircuitBreakerEvent,
  type AlertChannel,
  ALERT_CHANNELS,
} from "./listener";

// ===========================================================================
// CONFIGURATION
// ===========================================================================

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const ENABLE_LISTENER = process.env.ENABLE_LISTENER !== "false"; // default: true

// ===========================================================================
// APPLICATION SETUP
// ===========================================================================

/**
 * Creates and configures the Fastify application with all routes
 * and plugins.
 */
async function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  // -----------------------------------------------------------------------
  // Plugins
  // -----------------------------------------------------------------------
  await app.register(cors, {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
  });

  await app.register(websocket);

  // -----------------------------------------------------------------------
  // REST: Health check
  // -----------------------------------------------------------------------
  app.get("/api/health", async () => {
    return {
      status: "ok",
      service: "oracle-sanity-engine",
      version: "1.0.0",
      uptime: process.uptime(),
      listenerActive: ENABLE_LISTENER,
      eventsTracked: recentEvents.length,
      alertChannels: ALERT_CHANNELS.filter((ch) => ch.enabled).map(
        (ch) => ch.name
      ),
      timestamp: new Date().toISOString(),
    };
  });

  // -----------------------------------------------------------------------
  // REST: Recent events (paginated)
  // -----------------------------------------------------------------------
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>("/api/events", async (request) => {
    const limit = Math.min(
      parseInt(request.query.limit || "50", 10),
      500
    );
    const offset = parseInt(request.query.offset || "0", 10);

    const total = recentEvents.length;
    const items = recentEvents
      .slice()
      .reverse()
      .slice(offset, offset + limit);

    return {
      total,
      limit,
      offset,
      items,
    };
  });

  // -----------------------------------------------------------------------
  // REST: Single event by ID
  // -----------------------------------------------------------------------
  app.get<{
    Params: { id: string };
  }>("/api/events/:id", async (request, reply) => {
    const event = recentEvents.find((e) => e.id === request.params.id);

    if (!event) {
      reply.code(404);
      return { error: "Event not found", id: request.params.id };
    }

    return event;
  });

  // -----------------------------------------------------------------------
  // REST: Aggregate statistics
  // -----------------------------------------------------------------------
  app.get("/api/stats", async () => {
    if (recentEvents.length === 0) {
      return {
        totalEvents: 0,
        message: "No circuit-breaker events recorded yet.",
      };
    }

    const deviations = recentEvents.map((e) => Number(e.deviationBps));
    const avgDeviation =
      deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const maxDeviation = Math.max(...deviations);
    const minDeviation = Math.min(...deviations);

    const last24h = recentEvents.filter(
      (e) =>
        Date.now() - new Date(e.processedAt).getTime() < 24 * 60 * 60 * 1000
    );

    return {
      totalEvents: recentEvents.length,
      eventsLast24h: last24h.length,
      avgDeviationBps: Math.round(avgDeviation),
      maxDeviationBps: maxDeviation,
      minDeviationBps: minDeviation,
      latestEvent: recentEvents[recentEvents.length - 1] || null,
      alertChannels: ALERT_CHANNELS.filter((ch) => ch.enabled).map((ch) => ({
        type: ch.type,
        name: ch.name,
      })),
    };
  });

  // -----------------------------------------------------------------------
  // REST: Admin override — mock multi-sig endpoint
  //
  // In production, this would:
  //   1. Validate multi-sig signatures.
  //   2. Submit a transaction to the contract.
  //   3. Wait for confirmation.
  //
  // This mock implementation logs the request and returns a success
  // response for demonstration purposes.
  // -----------------------------------------------------------------------
  app.post<{
    Body: {
      signatures: string[]; // Array of ECDSA signatures
      newThreshold?: number; // Optional new deviation threshold
      caller: string; // Address initiating the override
    };
  }>("/api/admin/override", async (request, reply) => {
    const { signatures, newThreshold, caller } = request.body;

    // Validate minimum signatures (mock: require at least 2)
    if (!signatures || signatures.length < 2) {
      reply.code(400);
      return {
        error: "Insufficient signatures",
        required: 2,
        provided: signatures?.length || 0,
      };
    }

    // Log the override request
    console.log("========================================");
    console.log("🔑 ADMIN OVERRIDE REQUEST");
    console.log("========================================");
    console.log(`  Caller:          ${caller}`);
    console.log(`  Signatures:      ${signatures.length}`);
    console.log(`  New Threshold:   ${newThreshold || "unchanged"}`);
    console.log("========================================");

    // In production: submit transaction to contract
    // const tx = await contract.adminOverrideReset(...);
    // await tx.wait();

    return {
      status: "success",
      message: "Circuit breaker override approved (mock).",
      txHash: "0x" + "0".repeat(64), // Mock transaction hash
      newThreshold: newThreshold || "unchanged",
      timestamp: new Date().toISOString(),
    };
  });

  // -----------------------------------------------------------------------
  // REST: List configured alert channels
  // -----------------------------------------------------------------------
  app.get("/api/admin/channels", async () => {
    return {
      channels: ALERT_CHANNELS.map((ch: AlertChannel) => ({
        type: ch.type,
        name: ch.name,
        enabled: ch.enabled,
      })),
    };
  });

  // -----------------------------------------------------------------------
  // WebSocket: Real-time event stream
  //
  // Clients connect to `ws://localhost:3000/ws` and receive a JSON stream
  // of circuit-breaker events as they occur.
  //
  // The server sends a `heartbeat` ping every 30 seconds to keep the
  // connection alive.
  // -----------------------------------------------------------------------
  app.register(async function (fastify) {
    fastify.get(
      "/ws",
      { websocket: true },
      (socket, _req) => {
        console.log("[WS] Client connected");

        // Send initial events on connect
        const initialPayload = JSON.stringify({
          type: "initial",
          events: recentEvents.slice(-20), // Last 20 events
        });
        socket.send(initialPayload);

        // Heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
          if (socket.readyState === 1) {
            // OPEN
            socket.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 30_000);

        socket.on("close", () => {
          console.log("[WS] Client disconnected");
          clearInterval(heartbeatInterval);
        });

        socket.on("error", (err) => {
          console.error("[WS] Socket error:", err);
          clearInterval(heartbeatInterval);
        });
      }
    );
  });

  return app;
}

// ===========================================================================
// STARTUP
// ===========================================================================

/**
 * Starts the API server and optionally the event listener.
 */
async function start() {
  const app = await buildApp();

  // -----------------------------------------------------------------------
  // Start blockchain event listener (if enabled)
  // -----------------------------------------------------------------------
  if (ENABLE_LISTENER) {
    console.log("[Server] Starting blockchain event listener...");
    startEventListener(DEFAULT_LISTENER_CONFIG);
  } else {
    console.log("[Server] Event listener disabled (ENABLE_LISTENER=false).");
  }

  // -----------------------------------------------------------------------
  // Start HTTP server
  // -----------------------------------------------------------------------
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 Oracle Sanity Engine API running at http://${HOST}:${PORT}`);
    console.log(`   Health:  http://localhost:${PORT}/api/health`);
    console.log(`   Events:  http://localhost:${PORT}/api/events`);
    console.log(`   Stats:   http://localhost:${PORT}/api/stats`);
    console.log(`   WS:      ws://localhost:${PORT}/ws`);
    console.log(`   Admin:   http://localhost:${PORT}/api/admin/override\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Start the server
start();
