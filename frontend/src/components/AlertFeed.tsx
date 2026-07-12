// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Alert Feed Component
//
// Displays a streaming log of recent circuit-breaker events in reverse
// chronological order. Each entry shows:
//   - Timestamp
//   - Severity indicator
//   - Key metrics (deviation, prices)
//   - Transaction hash (truncated)
//
// Designed for the dashboard's live alert sidebar.
// ---------------------------------------------------------------------------

import { useOracleData, type CircuitBreakerEvent } from "../hooks/useOracleData";
import { StatusBadge } from "./StatusBadge";
import clsx from "clsx";
import { AlertTriangle, Clock, Activity, ExternalLink } from "lucide-react";

// ---------------------------------------------------------------------------
// Sub-component: Single alert row
// ---------------------------------------------------------------------------

function AlertRow({ event }: { event: CircuitBreakerEvent }) {
  const deviationBps = Number(event.deviationBps);
  const thresholdBps = Number(event.thresholdBps);
  const severityPct = (deviationBps / thresholdBps) * 100;

  // Color-code based on how far above threshold the deviation is
  const severityClass =
    severityPct > 200
      ? "border-red-500/30 bg-red-500/5"
      : severityPct > 100
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-slate-500/30";

  const time = new Date(event.processedAt).toLocaleTimeString();

  return (
    <div
      className={clsx(
        "flex flex-col gap-2 p-3 rounded-lg border animate-slide-up",
        severityClass
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={clsx(
              "w-4 h-4",
              severityPct > 200
                ? "text-red-400"
                : severityPct > 100
                  ? "text-amber-400"
                  : "text-slate-400"
            )}
          />
          <span className="text-xs font-medium text-slate-400">
            Circuit Breaker
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="w-3 h-3" />
          {time}
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Activity className="w-3 h-3" />
          <span className="text-xs">Deviation</span>
        </div>
        <span className="font-mono text-right tabular-nums text-amber-400 font-medium">
          {deviationBps.toLocaleString()} bps
        </span>

        <span className="text-xs text-slate-500">Primary</span>
        <span className="font-mono text-right tabular-nums text-slate-300">
          {Number(event.primaryPrice).toLocaleString()}
        </span>

        <span className="text-xs text-slate-500">Fallback</span>
        <span className="font-mono text-right tabular-nums text-slate-300">
          {Number(event.fallbackPrice).toLocaleString()}
        </span>
      </div>

      {/* Tx hash */}
      <div className="flex items-center justify-between mt-1">
        <code className="text-xs text-slate-500 font-mono">
          {event.txHash.slice(0, 10)}...{event.txHash.slice(-8)}
        </code>
        <button
          className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
          onClick={() => {
            // In production: open block explorer
            window.open(
              `https://etherscan.io/tx/${event.txHash}`,
              "_blank"
            );
          }}
        >
          Explorer
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AlertFeed() {
  const { events, connectionStatus, isLoaded } = useOracleData();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-severity-warn" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Alert Feed
          </h3>
        </div>
        <StatusBadge
          variant={
            connectionStatus === "connected"
              ? "safe"
              : connectionStatus === "connecting"
                ? "warn"
                : "danger"
          }
          label={
            connectionStatus === "connected"
              ? "Live"
              : connectionStatus === "connecting"
                ? "Connecting..."
                : "Offline"
          }
          pulse={connectionStatus === "connected"}
        />
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!isLoaded && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-slate-600 border-t-brand-400 rounded-full animate-spin" />
              <span className="text-sm">Loading events...</span>
            </div>
          </div>
        )}

        {isLoaded && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-elevated border border-white/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-severity-safe" />
            </div>
            <p className="text-sm font-medium">No alerts yet</p>
            <p className="text-xs text-slate-600 text-center max-w-[200px]">
              Circuit breaker events will appear here in real-time when detected.
            </p>
          </div>
        )}

        {events.map((event) => (
          <AlertRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
