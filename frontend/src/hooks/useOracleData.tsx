// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Custom Hook: useOracleData
//
// This hook manages the WebSocket connection to the backend and provides
// real-time oracle event data, connection status, and statistics to all
// dashboard components via React Context.
//
// It handles:
//   — WebSocket lifecycle (connect, reconnect, heartbeat, close)
//   — Incoming event parsing and state updates
//   — REST fallback for initial data load
//   — Connection status tracking
// ---------------------------------------------------------------------------

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";

// ===========================================================================
// DATA TYPES
// ===========================================================================

/** Matches the backend's CircuitBreakerEvent structure. */
export interface CircuitBreakerEvent {
  id: string;
  txHash: string;
  blockNumber: number;
  primaryPrice: string;
  fallbackPrice: string;
  deviationBps: string;
  thresholdBps: string;
  primaryTimestamp: string;
  fallbackTimestamp: string;
  reason: string;
  processedAt: string;
}

/** Aggregate statistics from the backend. */
export interface OracleStats {
  totalEvents: number;
  eventsLast24h: number;
  avgDeviationBps: number;
  maxDeviationBps: number;
  minDeviationBps: number;
  latestEvent: CircuitBreakerEvent | null;
  alertChannels: Array<{ type: string; name: string }>;
}

/** WebSocket connection states. */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

// ===========================================================================
// CONTEXT SHAPE
// ===========================================================================

interface OracleDataContextValue {
  /** All recent circuit-breaker events (newest first). */
  events: CircuitBreakerEvent[];

  /** Aggregate statistics. */
  stats: OracleStats | null;

  /** WebSocket connection status. */
  connectionStatus: ConnectionStatus;

  /** Manually refresh data from REST API. */
  refresh: () => Promise<void>;

  /** Whether the initial data load has completed. */
  isLoaded: boolean;
}

const OracleDataContext = createContext<OracleDataContextValue>({
  events: [],
  stats: null,
  connectionStatus: "disconnected",
  refresh: async () => {},
  isLoaded: false,
});

// ===========================================================================
// PROVIDER
// ===========================================================================

/**
 * Determines the WebSocket URL based on the current environment.
 *
 * In development (Vite), we use the proxy path `/ws`.
 * In production, we construct the URL from `window.location`.
 */
function getWebSocketUrl(): string {
  if (import.meta.env.DEV) {
    return `ws://${window.location.hostname}:3000/ws`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Determines the API base URL based on the current environment.
 */
function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:3000`;
  }
  return `${window.location.protocol}//${window.location.host}`;
}

interface OracleDataProviderProps {
  children: ReactNode;
}

export function OracleDataProvider({ children }: OracleDataProviderProps) {
  const [events, setEvents] = useState<CircuitBreakerEvent[]>([]);
  const [stats, setStats] = useState<OracleStats | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [isLoaded, setIsLoaded] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  // -----------------------------------------------------------------------
  // Fetch initial data from REST API
  // -----------------------------------------------------------------------
  const refresh = useCallback(async () => {
    try {
      const [eventsRes, statsRes] = await Promise.all([
        fetch(`${getApiBaseUrl()}/api/events?limit=100`),
        fetch(`${getApiBaseUrl()}/api/stats`),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.items || []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      setIsLoaded(true);
    } catch (err) {
      console.error("[useOracleData] Failed to fetch initial data:", err);
      // Use the ref to always call the latest refresh
      setTimeout(() => refreshRef.current(), 5_000);
    }
  }, []);

  // Keep refreshRef in sync with the latest refresh function
  refreshRef.current = refresh;

  // -----------------------------------------------------------------------
  // WebSocket connection management
  // -----------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    function connect() {
      if (!isMounted) return;

      const wsUrl = getWebSocketUrl();
      setConnectionStatus("connecting");

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        console.log("[useOracleData] WebSocket connected");
        setConnectionStatus("connected");
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const message = JSON.parse(event.data);

          // Handle initial events batch
          if (message.type === "initial" && Array.isArray(message.events)) {
            setEvents(message.events);
          }

          // Handle new events
          if (message.type === "new_event" && message.event) {
            setEvents((prev) => [message.event, ...prev].slice(0, 100));
          }

          // Handle heartbeat (no action needed)
          if (message.type === "heartbeat") {
            // Connection alive
          }
        } catch (err) {
          console.error("[useOracleData] Failed to parse WS message:", err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        console.log("[useOracleData] WebSocket disconnected, reconnecting in 5s...");
        setConnectionStatus("disconnected");
        wsRef.current = null;

        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 5_000);
      };

      ws.onerror = (err) => {
        console.error("[useOracleData] WebSocket error:", err);
        setConnectionStatus("error");
        ws.close();
      };
    }

    // Initial data load
    refresh().then(() => {
      if (isMounted) {
        connect();
      }
    });

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [refresh]);

  const contextValue: OracleDataContextValue = {
    events,
    stats,
    connectionStatus,
    refresh,
    isLoaded,
  };

  return (
    <OracleDataContext.Provider value={contextValue}>
      {children}
    </OracleDataContext.Provider>
  );
}

// ===========================================================================
// HOOK
// ===========================================================================

/** Hook to consume oracle data from the nearest `OracleDataProvider`. */
export function useOracleData(): OracleDataContextValue {
  return useContext(OracleDataContext);
}
