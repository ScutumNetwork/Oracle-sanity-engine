// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Soroban Contract Error Types
//
// All errors use `#[contracterror]` so they are properly encoded in Soroban's
// error reporting and can be decoded by off-chain listeners.
// ---------------------------------------------------------------------------

use soroban_sdk::contracterror;

/// Error codes for the OmniCheck oracle validation engine.
///
/// Each variant maps to a unique numeric code. Off-chain alerting systems
/// can match on these codes to route notifications to the correct channels.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum OracleError {
    /// The deviation between primary and fallback exceeds the threshold.
    FeedsDiverged = 1,

    /// The primary oracle's timestamp exceeds the staleness window.
    PriceStalePrimary = 2,

    /// The fallback oracle's timestamp exceeds the staleness window.
    PriceStaleFallback = 3,

    /// One or both price feeds returned zero or negative.
    InvalidPrice = 4,

    /// A feed timestamp is in the future relative to the current ledger time.
    TimestampInFuture = 5,

    /// Caller is not authorized for the requested admin action.
    Unauthorized = 6,

    /// A configuration parameter is invalid or out of bounds.
    InvalidConfig = 7,

    /// The circuit breaker has been tripped. Admin override required.
    CircuitBreakerTripped = 8,

    /// Contract has not been initialized yet.
    NotInitialized = 9,
}
