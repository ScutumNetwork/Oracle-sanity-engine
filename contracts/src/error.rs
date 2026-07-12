// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Custom Execution Error Enum
//
// This module defines the contract's complete error taxonomy. Every error
// variant carries a human-readable description so that both on-chain
// consumers and off-chain listeners can react appropriately.
//
// All errors derive `PartialEq`, `Eq`, and `serde::Serialize` for
// seamless cross-boundary propagation and analytics.
// ---------------------------------------------------------------------------

use alloc::string::String;
use serde::Serialize;

/// Top-level error categories for the `OmniCheck` oracle validation engine.
///
/// Each variant describes a distinct failure mode that the circuit breaker
/// can encounter during the `get_safe_price` computation. Variants are
/// designed to be descriptive enough for off-chain alerting systems to
/// route notifications to the correct channels.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum OracleError {
    // -----------------------------------------------------------------------
    // Divergence Errors
    // -----------------------------------------------------------------------

    /// The absolute variance between the Primary and Fallback price feeds
    /// exceeds the configured deviation threshold (default: 500 basis points).
    ///
    /// Fields:
    /// - `primary_price` — The price reported by the primary oracle.
    /// - `fallback_price` — The price reported by the fallback oracle.
    /// - `deviation_bps` — The computed deviation in basis points.
    /// - `threshold_bps` — The configured maximum allowable deviation.
    FeedsDiverged {
        primary_price: i128,
        fallback_price: i128,
        deviation_bps: i128,
        threshold_bps: i128,
    },

    // -----------------------------------------------------------------------
    // Staleness Errors
    // -----------------------------------------------------------------------

    /// The Primary oracle's latest update timestamp is older than the
    /// maximum allowed staleness window. This indicates that the primary
    /// feed may no longer be reflecting live market conditions.
    ///
    /// Fields:
    /// - `oracle_name` — Identifies which feed is stale (e.g., "Primary").
    /// - `feed_timestamp` — The timestamp of the last update.
    /// - `current_time` — The ledger's current block time.
    /// - `max_staleness_secs` — The maximum allowed age in seconds.
    PriceStalePrimary {
        feed_timestamp: u64,
        current_time: u64,
        max_staleness_secs: u64,
    },

    /// The Fallback oracle's latest update timestamp is older than the
    /// maximum allowed staleness window. This is critical because a stale
    /// fallback cannot serve as a reliable safety net.
    PriceStaleFallback {
        feed_timestamp: u64,
        current_time: u64,
        max_staleness_secs: u64,
    },

    // -----------------------------------------------------------------------
    // Input Validation Errors
    // -----------------------------------------------------------------------

    /// One or both price feeds returned a zero or negative value, which is
    /// invalid for price computation. This prevents division-by-zero and
    /// nonsensical negative-price scenarios.
    InvalidPrice {
        primary_price: i128,
        fallback_price: i128,
    },

    /// The provided timestamp is in the future relative to the current
    /// ledger time, which indicates a misconfigured oracle or a
    /// timestamp-manipulation attack.
    TimestampInFuture {
        feed_timestamp: u64,
        current_time: u64,
    },

    // -----------------------------------------------------------------------
    // Administrative Errors
    // -----------------------------------------------------------------------

    /// The caller is not authorized to perform the requested administrative
    /// action (e.g., resetting the circuit breaker or updating the
    /// deviation threshold).
    Unauthorized,

    /// A configuration parameter is invalid or out of acceptable bounds.
    ///
    /// Fields:
    /// - `field` — The name of the invalid configuration field.
    /// - `value` — The provided (invalid) value as a string.
    /// - `reason` — Human-readable explanation of why the value is invalid.
    InvalidConfig {
        field: String,
        value: String,
        reason: String,
    },

    /// The circuit breaker has been tripped and the contract is locked.
    /// An authorized administrator must call the override-reset function
    /// before new price validations can be accepted.
    CircuitBreakerTripped {
        reason: String,
    },
}

// ---------------------------------------------------------------------------
// Display Implementation
// ---------------------------------------------------------------------------
// Provide human-readable error messages for debugging and off-chain logging.
// ---------------------------------------------------------------------------

impl core::fmt::Display for OracleError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            OracleError::FeedsDiverged {
                primary_price,
                fallback_price,
                deviation_bps,
                threshold_bps,
            } => {
                write!(
                    f,
                    "Oracle feeds diverged: primary={}, fallback={}, deviation={} bps (threshold={} bps)",
                    primary_price, fallback_price, deviation_bps, threshold_bps
                )
            }
            OracleError::PriceStalePrimary {
                feed_timestamp,
                current_time,
                max_staleness_secs,
            } => {
                write!(
                    f,
                    "Primary oracle price is stale: feed_time={}, current_time={}, max_staleness={}s",
                    feed_timestamp, current_time, max_staleness_secs
                )
            }
            OracleError::PriceStaleFallback {
                feed_timestamp,
                current_time,
                max_staleness_secs,
            } => {
                write!(
                    f,
                    "Fallback oracle price is stale: feed_time={}, current_time={}, max_staleness={}s",
                    feed_timestamp, current_time, max_staleness_secs
                )
            }
            OracleError::InvalidPrice {
                primary_price,
                fallback_price,
            } => {
                write!(
                    f,
                    "Invalid price(s): primary={}, fallback={}",
                    primary_price, fallback_price
                )
            }
            OracleError::TimestampInFuture {
                feed_timestamp,
                current_time,
            } => {
                write!(
                    f,
                    "Timestamp in future: feed={}, current={}",
                    feed_timestamp, current_time
                )
            }
            OracleError::Unauthorized => {
                write!(f, "Unauthorized caller")
            }
            OracleError::InvalidConfig {
                field,
                value,
                reason,
            } => {
                write!(
                    f,
                    "Invalid configuration: {} = {} — {}",
                    field, value, reason
                )
            }
            OracleError::CircuitBreakerTripped { reason } => {
                write!(f, "Circuit breaker tripped: {}", reason)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_display_feeds_diverged() {
        let err = OracleError::FeedsDiverged {
            primary_price: 100_000,
            fallback_price: 95_000,
            deviation_bps: 500,
            threshold_bps: 500,
        };
        let msg = format!("{}", err);
        assert!(msg.contains("Oracle feeds diverged"));
        assert!(msg.contains("500 bps"));
    }

    #[test]
    fn test_display_stale_primary() {
        let err = OracleError::PriceStalePrimary {
            feed_timestamp: 1000,
            current_time: 2000,
            max_staleness_secs: 600,
        };
        let msg = format!("{}", err);
        assert!(msg.contains("Primary oracle price is stale"));
    }

    #[test]
    fn test_error_equality() {
        let a = OracleError::Unauthorized;
        let b = OracleError::Unauthorized;
        assert_eq!(a, b);
    }

    #[test]
    fn test_serialization() {
        let err = OracleError::FeedsDiverged {
            primary_price: 100_000,
            fallback_price: 95_000,
            deviation_bps: 500,
            threshold_bps: 500,
        };
        let json = serde_json::to_string(&err).expect("Serialization should succeed");
        assert!(json.contains("FeedsDiverged"));
        assert!(json.contains("deviation_bps"));
    }
}
