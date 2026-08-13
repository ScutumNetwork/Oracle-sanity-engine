// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Alert Feed Component
//
// Displays a streaming log of recent circuit-breaker trips in reverse
// chronological order. Each entry shows:
//   - Detection time
//   - Severity indicator
//   - Trip reason and reason code
//   - Deviation threshold and max staleness at detection time
//
// Designed for the dashboard's live alert sidebar.
// ---------------------------------------------------------------------------

import { useOracleData, type CircuitBreakerEvent } from "../hooks/useOracleData";
import { StatusBadge } from "./StatusBadge";
import { AlertTriangle, Clock } from "lucide-react";

// ---------------------------------------------------------------------------
// Sub-component: Single alert row
// ---------------------------------------------------------------------------

function AlertRow({ event }: { event: CircuitBreakerEvent }) {
  const time = new Date(event.detectedAt).toLocaleTimeString();

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5 animate-slide-up">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-xs font-medium text-slate-400">
            Circuit Breaker
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="w-3 h-3" />
          {time}
        </div>
      </div>

      {/* Reason */}
      <p className="text-sm text-slate-200">{event.reason}</p>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-xs text-slate-500">Reason Code</span>
        <span className="font-mono text-right tabular-nums text-amber-400 font-medium">
          {event.reasonCode}
        </span>

        <span className="text-xs text-slate-500">Threshold</span>
        <span className="font-mono text-right tabular-nums text-slate-300">
          {event.deviationThresholdBps.toLocaleString()} bps
        </span>

        <span className="text-xs text-slate-500">Max Staleness</span>
        <span className="font-mono text-right tabular-nums text-slate-300">
          {event.maxStalenessSecs}s
        </span>
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
              Circuit breaker trips will appear here when detected.
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
