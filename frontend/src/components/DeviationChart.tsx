// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Deviation Chart Component
//
// Renders a time-series chart showing historical deviation between
// primary and fallback oracle feeds. Uses Recharts for the
// visualization with a dark-theme styling.
//
// Features:
//   - Area chart with gradient fill
//   - Threshold reference line
//   - Color-coded by severity zone
//   - Responsive, fits container
// ---------------------------------------------------------------------------

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useOracleData } from "../hooks/useOracleData";
import { useMemo } from "react";

// ===========================================================================
// TYPES
// ===========================================================================

interface ChartDataPoint {
  time: string;
  deviation: number;
  threshold: number;
  label: string;
}

// ===========================================================================
// CHART TOOLTIP
// ===========================================================================

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint; value: number }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  return (
    <div className="card-glass px-4 py-3 text-sm space-y-1">
      <p className="text-xs text-slate-400">{data.time}</p>
      <p className="font-mono font-semibold">
        Deviation:{" "}
        <span className="text-amber-400">{data.deviation.toLocaleString()} bps</span>
      </p>
      <p className="text-xs text-slate-500">
        Threshold: {data.threshold.toLocaleString()} bps
      </p>
    </div>
  );
}

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================

export function DeviationChart() {
  const { events } = useOracleData();

  /**
   * Transforms raw events into chart-ready data points.
   *
   * Each point includes the deviation, threshold, time, and a human-readable
   * label for the tooltip.
   */
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (events.length === 0) {
      // Generate sample data for the empty state demo
      return generateSampleData();
    }

    return events
      .slice()
      .reverse()
      .slice(-30) // Last 30 data points
      .map((event, i) => ({
        time: new Date(event.processedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        deviation: Number(event.deviationBps),
        threshold: Number(event.thresholdBps),
        label: `Event #${i + 1}`,
      }));
  }, [events]);

  const maxThreshold = Math.max(...chartData.map((d) => d.threshold), 500);
  const maxDeviation = Math.max(...chartData.map((d) => d.deviation), 0);
  const yAxisMax = Math.max(maxThreshold * 1.5, maxDeviation * 1.2, 1000);

  return (
    <div className="w-full h-full">
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
          No deviation data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            {/* Grid */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(148, 163, 184, 0.1)"
            />

            {/* X Axis: time labels */}
            <XAxis
              dataKey="time"
              stroke="rgba(148, 163, 184, 0.4)"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            {/* Y Axis: deviation in bps */}
            <YAxis
              stroke="rgba(148, 163, 184, 0.4)"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              domain={[0, yAxisMax]}
              tickFormatter={(value: number) =>
                value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value}`
              }
            />

            {/* Tooltip */}
            <Tooltip content={<CustomTooltip />} />

            {/* Threshold reference line */}
            <ReferenceLine
              y={chartData[0]?.threshold ?? 500}
              stroke="#f59e0b"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: "Threshold",
                position: "insideTopRight",
                fill: "#f59e0b",
                fontSize: 11,
                fontWeight: 500,
              }}
            />

            {/* Deviation area with gradient */}
            <defs>
              <linearGradient id="deviationGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#f59e0b" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <Area
              type="monotone"
              dataKey="deviation"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#deviationGradient)"
              dot={false}
              activeDot={{
                r: 5,
                stroke: "#ef4444",
                strokeWidth: 2,
                fill: "#0f172a",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ===========================================================================
// SAMPLE DATA (for empty-state demo)
// ===========================================================================

function generateSampleData(): ChartDataPoint[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const minutesAgo = (11 - i) * 5;
    const time = new Date(now.getTime() - minutesAgo * 60_000);
    return {
      time: time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      deviation: Math.floor(50 + Math.random() * 300),
      threshold: 500,
      label: `Sample #${i + 1}`,
    };
  });
}
