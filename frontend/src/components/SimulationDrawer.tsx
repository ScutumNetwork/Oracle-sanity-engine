// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Simulation Drawer Component
//
// This component provides a diagnostic simulation interface for developers
// to test oracle price divergence scenarios without executing real transactions.
//
// Features:
// - Simulate Primary vs Secondary price divergence
// - Visualize deviation in Basis Points (BPS)
// - Check timestamp freshness against Stellar ledger time
// - Display circuit breaker status (Normal / Tripped)
// - Test different price scenarios and validation thresholds
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@radix-ui/react-dialog";
import { Play, AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { useContractData } from "../hooks/useContractData";

interface SimulationResult {
  deviationBps: number;
  timestampFreshness: number; // seconds since last update
  circuitBreakerStatus: "normal" | "tripped";
  wouldPass: boolean;
  reason: string;
}

export function SimulationDrawer() {
  const { config } = useContractData();
  const [isOpen, setIsOpen] = useState(false);
  const [primaryPrice, setPrimaryPrice] = useState<string>("200000000000"); // $20,000 in STROOP
  const [fallbackPrice, setFallbackPrice] = useState<string>("200000000000"); // $20,000 in STROOP
  const [primaryTimestamp, setPrimaryTimestamp] = useState<string>(Math.floor(Date.now() / 1000).toString());
  const [fallbackTimestamp, setFallbackTimestamp] = useState<string>(Math.floor(Date.now() / 1000).toString());
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

  const runSimulation = () => {
    const primary = parseFloat(primaryPrice);
    const fallback = parseFloat(fallbackPrice);
    const primaryTs = parseInt(primaryTimestamp);
    const fallbackTs = parseInt(fallbackTimestamp);
    const currentTs = Math.floor(Date.now() / 1000);

    if (isNaN(primary) || isNaN(fallback) || isNaN(primaryTs) || isNaN(fallbackTs)) {
      return;
    }

    // Calculate deviation in basis points
    const diff = Math.abs(primary - fallback);
    const deviationBps = (diff * 10000) / primary;

    // Calculate timestamp freshness
    const primaryAge = currentTs - primaryTs;
    const fallbackAge = currentTs - fallbackTs;
    const maxAge = Math.max(primaryAge, fallbackAge);

    // Check against threshold
    const threshold = config?.deviation_threshold_bps || 500;
    const maxStaleness = config?.max_staleness_secs || 600;

    let circuitBreakerStatus: "normal" | "tripped" = "normal";
    let reason = "";
    let wouldPass = true;

    if (primary <= 0 || fallback <= 0) {
      circuitBreakerStatus = "tripped";
      reason = "Invalid price (must be positive)";
      wouldPass = false;
    } else if (primaryTs > currentTs || fallbackTs > currentTs) {
      circuitBreakerStatus = "tripped";
      reason = "Timestamp in future";
      wouldPass = false;
    } else if (primaryAge > maxStaleness) {
      circuitBreakerStatus = "tripped";
      reason = "Primary feed stale";
      wouldPass = false;
    } else if (fallbackAge > maxStaleness) {
      circuitBreakerStatus = "tripped";
      reason = "Fallback feed stale";
      wouldPass = false;
    } else if (deviationBps > threshold) {
      circuitBreakerStatus = "tripped";
      reason = `Feeds diverged (${deviationBps.toFixed(2)} bps > ${threshold} bps threshold)`;
      wouldPass = false;
    } else {
      reason = "All checks passed";
    }

    setSimulationResult({
      deviationBps,
      timestampFreshness: maxAge,
      circuitBreakerStatus,
      wouldPass,
      reason,
    });
  };

  const getStatusColor = (status: "normal" | "tripped") => {
    return status === "normal" ? "text-severity-safe" : "text-severity-danger";
  };

  const getStatusIcon = (status: "normal" | "tripped") => {
    return status === "normal" ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2">
          <Play className="w-4 h-4" />
          Simulate
        </button>
      </DialogTrigger>
      <DialogContent className="bg-surface border border-white/10 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <DialogTitle className="text-lg font-semibold text-white mb-4">
            Oracle Price Simulation
          </DialogTitle>

          {/* Input Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Price Inputs</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400">Primary Price (STROOP)</label>
                <input
                  type="number"
                  value={primaryPrice}
                  onChange={(e) => setPrimaryPrice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="200000000000"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400">Fallback Price (STROOP)</label>
                <input
                  type="number"
                  value={fallbackPrice}
                  onChange={(e) => setFallbackPrice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder="200000000000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400">Primary Timestamp (Unix)</label>
                <input
                  type="number"
                  value={primaryTimestamp}
                  onChange={(e) => setPrimaryTimestamp(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder={Math.floor(Date.now() / 1000).toString()}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400">Fallback Timestamp (Unix)</label>
                <input
                  type="number"
                  value={fallbackTimestamp}
                  onChange={(e) => setFallbackTimestamp(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                  placeholder={Math.floor(Date.now() / 1000).toString()}
                />
              </div>
            </div>

            <button
              onClick={runSimulation}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Run Simulation
            </button>
          </div>

          {/* Current Configuration */}
          {config && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Current Configuration</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Deviation Threshold:</span>
                  <span className="text-white ml-2">{config.deviation_threshold_bps} bps</span>
                </div>
                <div>
                  <span className="text-slate-400">Max Staleness:</span>
                  <span className="text-white ml-2">{config.max_staleness_secs}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Simulation Results */}
          {simulationResult && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Simulation Results</h3>
              
              <div className={`bg-white/5 border border-white/10 rounded-lg p-4 ${simulationResult.circuitBreakerStatus === "tripped" ? "border-severity-danger/50" : "border-severity-safe/50"}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={getStatusColor(simulationResult.circuitBreakerStatus)}>
                    {getStatusIcon(simulationResult.circuitBreakerStatus)}
                  </div>
                  <div>
                    <div className={`text-sm font-medium ${simulationResult.circuitBreakerStatus === "normal" ? "text-severity-safe" : "text-severity-danger"}`}>
                      Circuit Breaker: {simulationResult.circuitBreakerStatus === "normal" ? "Normal" : "Tripped"}
                    </div>
                    <div className="text-xs text-slate-400">{simulationResult.reason}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-slate-400 text-xs">Deviation</div>
                      <div className="text-white">{simulationResult.deviationBps.toFixed(2)} bps</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-slate-400 text-xs">Freshness</div>
                      <div className="text-white">{simulationResult.timestampFreshness}s old</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className={`w-4 h-4 ${simulationResult.wouldPass ? "text-severity-safe" : "text-severity-danger"}`} />
                    <div>
                      <div className="text-slate-400 text-xs">Validation</div>
                      <div className={`text-white ${simulationResult.wouldPass ? "text-severity-safe" : "text-severity-danger"}`}>
                        {simulationResult.wouldPass ? "Pass" : "Fail"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Deviation Visualization */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-xs text-slate-400 mb-2">Deviation Visualization</div>
                <div className="relative h-4 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`absolute top-0 left-0 h-full transition-all ${
                      simulationResult.deviationBps > (config?.deviation_threshold_bps || 500)
                        ? "bg-severity-danger"
                        : "bg-severity-safe"
                    }`}
                    style={{
                      width: `${Math.min((simulationResult.deviationBps / (config?.deviation_threshold_bps || 500)) * 100, 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>0 bps</span>
                  <span>Threshold: {config?.deviation_threshold_bps || 500} bps</span>
                  <span>Current: {simulationResult.deviationBps.toFixed(2)} bps</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
