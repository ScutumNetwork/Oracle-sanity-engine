// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Oracle Health Table Component
//
// Displays a real-time comparison table showing the live performance delta
// between competing oracle data feeds. Each row represents a monitored
// asset pair with:
//   - Primary feed name & latest price
//   - Fallback feed name & latest price
//   - Computed deviation in basis points
//   - Timestamp freshness
//   - Health status indicator
//
// In production, this data would come from a live WebSocket feed of all
// monitored oracle pairs. For this reference implementation, we show
// mock data and integrate with the real circuit-breaker event stream.
// ---------------------------------------------------------------------------

import { useOracleData } from "../hooks/useOracleData";
import { StatusBadge, type StatusVariant } from "./StatusBadge";
import { Clock, TrendingDown, TrendingUp, Shield } from "lucide-react";
import clsx from "clsx";

// ===========================================================================
// TYPES
// ===========================================================================

interface OracleFeedRow {
  id: string;
  pair: string;
  primaryFeed: string;
  primaryPrice: number;
  fallbackFeed: string;
  fallbackPrice: number;
  deviationBps: number;
  thresholdBps: number;
  primaryAge: number; // seconds
  fallbackAge: number; // seconds
  status: "operational" | "degraded" | "critical";
}

// ===========================================================================
// MOCK DATA
//
// In a production deployment, this data would be live-streamed from the
// backend WebSocket connection. These mock rows demonstrate the UI layout.
// ===========================================================================

const MOCK_FEEDS: OracleFeedRow[] = [
  {
    id: "eth-usd",
    pair: "ETH / USD",
    primaryFeed: "Chainlink",
    primaryPrice: 3_245_67, // $3,245.67 (scaled)
    fallbackFeed: "Pyth Network",
    fallbackPrice: 3_241_89, // $3,241.89
    deviationBps: 12,
    thresholdBps: 500,
    primaryAge: 12,
    fallbackAge: 8,
    status: "operational",
  },
  {
    id: "btc-usd",
    pair: "BTC / USD",
    primaryFeed: "Chainlink",
    primaryPrice: 67_890_12,
    fallbackFeed: "Pyth Network",
    fallbackPrice: 67_850_45,
    deviationBps: 58,
    thresholdBps: 500,
    primaryAge: 24,
    fallbackAge: 15,
    status: "operational",
  },
  {
    id: "link-usd",
    pair: "LINK / USD",
    primaryFeed: "Chainlink",
    primaryPrice: 14_52,
    fallbackFeed: "Band Protocol",
    fallbackPrice: 14_48,
    deviationBps: 28,
    thresholdBps: 500,
    primaryAge: 45,
    fallbackAge: 90,
    status: "operational",
  },
  {
    id: "aave-usd",
    pair: "AAVE / USD",
    primaryFeed: "Chainlink",
    primaryPrice: 98_75,
    fallbackFeed: "TWAP (Uniswap V3)",
    fallbackPrice: 93_42,
    deviationBps: 539,
    thresholdBps: 500,
    primaryAge: 30,
    fallbackAge: 22,
    status: "critical",
  },
  {
    id: "uni-usd",
    pair: "UNI / USD",
    primaryFeed: "Chainlink",
    primaryPrice: 7_89,
    fallbackFeed: "RedStone",
    fallbackPrice: 7_85,
    deviationBps: 51,
    thresholdBps: 500,
    primaryAge: 120,
    fallbackAge: 180,
    status: "degraded",
  },
];

// ===========================================================================
// SUB-COMPONENT: Table Row
// ===========================================================================

function FeedRow({ feed }: { feed: OracleFeedRow }) {
  const statusVariant: StatusVariant =
    feed.status === "critical"
      ? "danger"
      : feed.status === "degraded"
        ? "warn"
        : "safe";

  const deviationPct = (feed.deviationBps / 100).toFixed(2);
  const deviationRatio = feed.deviationBps / feed.thresholdBps;

  return (
    <tr
      className={clsx(
        "border-b border-white/5 transition-colors duration-150 hover:bg-white/5",
        feed.status === "critical" && "bg-red-500/5 hover:bg-red-500/10"
      )}
    >
      {/* Pair */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-400" />
          <span className="font-medium text-slate-200">{feed.pair}</span>
        </div>
      </td>

      {/* Primary Feed */}
      <td className="py-3 px-4">
        <div className="flex flex-col">
          <span className="text-xs text-slate-400">{feed.primaryFeed}</span>
          <span className="font-mono text-sm tabular-nums text-slate-200">
            ${(feed.primaryPrice / 100).toFixed(2)}
          </span>
        </div>
      </td>

      {/* Fallback Feed */}
      <td className="py-3 px-4">
        <div className="flex flex-col">
          <span className="text-xs text-slate-400">{feed.fallbackFeed}</span>
          <span className="font-mono text-sm tabular-nums text-slate-200">
            ${(feed.fallbackPrice / 100).toFixed(2)}
          </span>
        </div>
      </td>

      {/* Deviation */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {deviationRatio > 0.8 ? (
            <TrendingUp className="w-4 h-4 text-severity-danger" />
          ) : deviationRatio > 0.5 ? (
            <TrendingUp className="w-4 h-4 text-severity-warn" />
          ) : (
            <TrendingDown className="w-4 h-4 text-severity-safe" />
          )}
          <span
            className={clsx(
              "font-mono text-sm font-semibold tabular-nums",
              feed.deviationBps > feed.thresholdBps
                ? "text-severity-danger"
                : feed.deviationBps > feed.thresholdBps * 0.7
                  ? "text-severity-warn"
                  : "text-severity-safe"
            )}
          >
            {feed.deviationBps} bps
          </span>
          <span className="text-xs text-slate-500">({deviationPct}%)</span>
        </div>
      </td>

      {/* Freshness */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-500" />
          <span className="text-xs text-slate-400 tabular-nums">
            {feed.primaryAge}s / {feed.fallbackAge}s
          </span>
        </div>
      </td>

      {/* Status */}
      <td className="py-3 px-4">
        <StatusBadge
          variant={statusVariant}
          label={
            feed.status === "critical"
              ? "CRITICAL"
              : feed.status === "degraded"
                ? "Degraded"
                : "Healthy"
          }
        />
      </td>
    </tr>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================

export function OracleHealthTable() {
  const { events, stats } = useOracleData();

  /**
   * In a full production implementation, we'd merge mock feed data with
   * live events to show which feeds have recently tripped the circuit breaker.
   *
   * For this reference implementation, we display the mock feed table with
   * an overlay showing the latest circuit-breaker event count.
   */
  const tripCount = stats?.totalEvents ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Oracle Health Monitor
          </h3>
        </div>
        {tripCount > 0 && (
          <span className="text-xs font-mono text-severity-danger bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
            {tripCount} trip{tripCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-slate-500 uppercase tracking-wider bg-white/[0.02]">
              <th className="py-2 px-4 text-left font-medium">Pair</th>
              <th className="py-2 px-4 text-left font-medium">Primary</th>
              <th className="py-2 px-4 text-left font-medium">Fallback</th>
              <th className="py-2 px-4 text-left font-medium">Deviation</th>
              <th className="py-2 px-4 text-left font-medium">Age</th>
              <th className="py-2 px-4 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_FEEDS.map((feed) => (
              <FeedRow key={feed.id} feed={feed} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: stats summary */}
      {stats && (
        <div className="px-4 py-2 border-t border-white/10 text-xs text-slate-500 flex items-center justify-between">
          <span>
            Avg deviation: {stats.avgDeviationBps} bps
          </span>
          <span>
            Max deviation: {stats.maxDeviationBps} bps
          </span>
          <span>
            Events (24h): {stats.eventsLast24h}
          </span>
        </div>
      )}
    </div>
  );
}
