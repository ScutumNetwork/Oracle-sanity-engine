// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Main Dashboard Application
//
// This is the root React component that composes the entire diagnostic
// dashboard. Layout:
//
//   ┌──────────────────────────────────────────────────────┐
//   │  Header (logo, status, admin button)                │
//   ├─────────────────────────────────┬────────────────────┤
//   │                                 │                    │
//   │  Deviation Chart (top)          │  Alert Feed        │
//   │                                 │  (right sidebar)   │
//   ├─────────────────────────────────┤                    │
//   │                                 │                    │
//   │  Oracle Health Table (bottom)   │                    │
//   │                                 │                    │
//   └─────────────────────────────────┴────────────────────┘
//
// The dashboard is fully responsive and uses:
//   - Tailwind CSS for styling
//   - Radix UI for accessible primitives
//   - Recharts for data visualization
//   - Lucide React for icons
//   - Custom hooks for WebSocket data
// ---------------------------------------------------------------------------

import { DashboardHeader } from "./components/DashboardHeader";
import { DeviationChart } from "./components/DeviationChart";
import { OracleHealthTable } from "./components/OracleHealthTable";
import { AlertFeed } from "./components/AlertFeed";
import { OracleDataProvider } from "./hooks/useOracleData";

// ===========================================================================
// APP
// ===========================================================================

export default function App() {
  return (
    <OracleDataProvider>
      <div className="min-h-screen bg-surface flex flex-col">
        {/* --------------------------------------------------------------- */}
        {/* HEADER */}
        {/* --------------------------------------------------------------- */}
        <DashboardHeader />

        {/* --------------------------------------------------------------- */}
        {/* MAIN CONTENT AREA */}
        {/* --------------------------------------------------------------- */}
        <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 lg:p-6 max-w-[1600px] mx-auto w-full">
          {/* --------------------------------------------------------- */}
          {/* LEFT COLUMN: Charts + Table */}
          {/* --------------------------------------------------------- */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* Deviation chart card */}
            <section className="card-glass p-5 h-[340px] flex flex-col">
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">
                Deviation Over Time
              </h2>
              <div className="flex-1">
                <DeviationChart />
              </div>
            </section>

            {/* Oracle health table card */}
            <section className="card-glass flex-1 min-h-[400px] flex flex-col overflow-hidden">
              <OracleHealthTable />
            </section>
          </div>

          {/* --------------------------------------------------------- */}
          {/* RIGHT COLUMN: Alert Feed */}
          {/* --------------------------------------------------------- */}
          <aside className="w-full lg:w-[380px] shrink-0 flex flex-col">
            <section className="card-glass flex-1 min-h-[500px] flex flex-col overflow-hidden">
              <AlertFeed />
            </section>
          </aside>
        </main>

        {/* --------------------------------------------------------------- */}
        {/* FOOTER */}
        {/* --------------------------------------------------------------- */}
        <footer className="border-t border-white/10 px-6 py-3 text-center">
          <p className="text-xs text-slate-600">
            Oracle Sanity Engine v1.0.0 —{" "}
            <a
              href="https://github.com/ScutumNetwork/oracle-sanity-engine"
              className="text-brand-400 hover:text-brand-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              ScutumNetwork
            </a>{" "}
            — Open Source Security Public Good
          </p>
        </footer>
      </div>
    </OracleDataProvider>
  );
}

// ===========================================================================
// DASHBOARD HEADER (inline component — can be extracted later)
// ===========================================================================

import { useOracleData, type ConnectionStatus } from "./hooks/useOracleData";
import { AdminOverridePanel } from "./components/AdminOverridePanel";
import { StatusBadge, type StatusVariant } from "./components/StatusBadge";
import { Shield, Wifi, WifiOff, Activity } from "lucide-react";
import clsx from "clsx";

function DashboardHeader() {
  const { connectionStatus, stats } = useOracleData();

  const statusVariant: StatusVariant =
    connectionStatus === "connected"
      ? "safe"
      : connectionStatus === "connecting"
        ? "warn"
        : "danger";

  const statusLabel =
    connectionStatus === "connected"
      ? "Live"
      : connectionStatus === "connecting"
        ? "Connecting..."
        : "Offline";

  return (
    <header className="bg-gradient-header border-b border-white/10">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <Shield className="w-5 h-5 text-brand-300" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                Oracle Sanity Engine
              </h1>
              <p className="text-xs text-brand-200/70 font-mono">
                ScutumNetwork
              </p>
            </div>
          </div>

          {/* Center: Connection status */}
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {connectionStatus === "connected" ? (
                <Wifi className="w-3.5 h-3.5 text-severity-safe" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-severity-danger" />
              )}
              <StatusBadge variant={statusVariant} label={statusLabel} />
            </div>

            {stats && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Activity className="w-3.5 h-3.5" />
                <span>
                  {stats.totalEvents} event{stats.totalEvents !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Right: Admin action */}
          <div className="flex items-center gap-3">
            <AdminOverridePanel />
          </div>
        </div>
      </div>
    </header>
  );
}
