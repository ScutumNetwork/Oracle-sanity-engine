// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Contract Status Card Component
//
// Displays live on-chain data from the deployed Soroban contract:
//   - Circuit breaker lock status (big visual indicator)
//   - Deviation threshold and max staleness config
//   - Last diagnostic value
//   - Link to Stellar Explorer
//
// Polls the contract every 30 seconds via useContractData.
// ---------------------------------------------------------------------------

import { useContractData } from "../hooks/useContractData";
import { StatusBadge } from "./StatusBadge";
import { EXPLORER_URL } from "../config";
import {
  Lock,
  Unlock,
  Shield,
  ExternalLink,
  Activity,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";

export function ContractStatusCard() {
  const { isLocked, config, lastDiagnostic, isLoaded, error, refresh } =
    useContractData();

  // Determine lock status display
  const isTripped = isLocked === true;
  const statusVariant = isTripped ? "danger" : "safe";
  const statusLabel = isTripped ? "LOCKED" : "Operational";

  return (
    <section className="card-glass flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Contract Status
          </h3>
        </div>
        <a
          href={EXPLORER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
        >
          Explorer
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Loading state */}
        {!isLoaded && !error && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">Unable to reach contract</span>
            </div>
            <button
              onClick={() => refresh()}
              className="btn-ghost text-xs px-3 py-1"
            >
              Retry
            </button>
          </div>
        )}

        {/* Lock status — big visual indicator */}
        {isLoaded && !error && (
          <>
            <div
              className={clsx(
                "flex items-center gap-4 p-4 rounded-xl border transition-all duration-300",
                isTripped
                  ? "border-red-500/30 bg-red-500/10 animate-pulse-slow"
                  : "border-severity-safe/30 bg-severity-safe/5"
              )}
            >
              <div
                className={clsx(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  isTripped ? "bg-red-500/20" : "bg-severity-safe/20"
                )}
              >
                {isTripped ? (
                  <Lock className="w-6 h-6 text-red-400" />
                ) : (
                  <Unlock className="w-6 h-6 text-severity-safe" />
                )}
              </div>
              <div>
                <StatusBadge variant={statusVariant} label={statusLabel} />
                <p className="text-xs text-slate-400 mt-1.5">
                  {isTripped
                    ? "Circuit breaker tripped — admin override required"
                    : "System is healthy and accepting price validations"}
                </p>
              </div>
            </div>

            {/* Config details */}
            {config && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <Activity className="w-3 h-3" />
                    Threshold
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-200">
                    {config.deviation_threshold_bps.toLocaleString()} bps
                  </span>
                  <span className="text-xs text-slate-500 ml-1">
                    ({(config.deviation_threshold_bps / 100).toFixed(1)}%)
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                    <Clock className="w-3 h-3" />
                    Max Staleness
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-200">
                    {config.max_staleness_secs}s
                  </span>
                </div>
              </div>
            )}

            {/* Last diagnostic */}
            {lastDiagnostic !== null && (
              <div className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Activity className="w-3 h-3" />
                  Last Diagnostic
                </div>
                <span className="font-mono text-sm text-slate-300">
                  {lastDiagnostic}{" "}
                  {lastDiagnostic > 0 && lastDiagnostic <= 9
                    ? "(error code)"
                    : lastDiagnostic > 9
                      ? "bps deviation"
                      : ""}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
