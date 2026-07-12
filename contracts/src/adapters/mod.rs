// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Pluggable Adapter Framework
//
// This module defines the `OracleAdapter` trait: a standardized interface
// that every oracle integration must implement. Community contributors can
// easily add support for new oracle networks (Chainlink, Pyth, Band Protocol,
// TWAP, RedStone, custom feeds, etc.) by implementing this trait and adding
// the new module to this file's `pub mod` declarations.
//
// Design principles:
//   1. Trait methods are infallible at the adapter level — adapters return
//      raw data; validation happens in the OmniCheck engine.
//   2. The `OraclePrice` struct is a common currency that all adapters
//      produce, keeping the engine decoupled from adapter specifics.
//   3. Adapters are expected to be stateless; they receive configuration at
//      construction time (stored in Instance storage) and produce prices
//      on-demand.
// ---------------------------------------------------------------------------

pub mod chainlink;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// OraclePrice — Universal Price Feed Result
// ---------------------------------------------------------------------------

/// A normalized price feed result that every adapter must produce.
///
/// This struct is the "common currency" consumed by the `OmniCheck` engine.
/// Regardless of the underlying oracle network, every adapter normalizes its
/// output into this format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OraclePrice {
    /// The asset price, scaled to a fixed-point representation.
    ///
    /// The exact scaling factor is adapter-defined (e.g., 1e18 for 18-decimal
    /// Chainlink feeds, 1e8 for Pyth), but within the context of a single
    /// `OmniCheck` validation run both the Primary and Fallback adapters MUST
    /// use the same scaling factor. This is enforced by the engine at call time.
    pub price: i128,

    /// Unix timestamp (seconds) of when this price was last updated on-chain.
    pub timestamp: u64,

    /// Human-readable label identifying the oracle source.
    /// E.g., "Chainlink ETH/USD", "Pyth BTC/USD".
    pub feed_label: String,
}

// ---------------------------------------------------------------------------
// OracleAdapter Trait
// ---------------------------------------------------------------------------

/// The core interface for any oracle price feed adapter.
///
/// Implementors of this trait plug into the `OmniCheck` engine and provide
/// normalized price data. Each adapter is responsible for decoding the raw
/// on-chain data from its respective oracle and returning an `OraclePrice`.
///
/// # Example
///
/// ```ignore
/// pub struct ChainlinkAdapter;
///
/// impl OracleAdapter for ChainlinkAdapter {
///     fn feed_label(&self) -> &str { "Chainlink" }
///     fn get_price(&self, aggregator_address: &[u8]) -> OraclePrice {
///         // Decode Chainlink aggregator storage and return OraclePrice
///         OraclePrice { price: 2000_00000000, timestamp: 1700000000, feed_label: "Chainlink ETH/USD".into() }
///     }
/// }
/// ```
pub trait OracleAdapter {
    /// Returns a human-readable label for this adapter.
    /// Used in event logs and off-chain dashboards.
    fn feed_label(&self) -> &str;

    /// Fetches the current price from the oracle.
    ///
    /// # Arguments
    /// - `feed_id` — An adapter-specific identifier for the price feed.
    ///   For Chainlink this is an aggregator contract address (20 bytes);
    ///   for Pyth it's a price feed ID (32 bytes).
    ///
    /// # Returns
    /// A normalized `OraclePrice` containing the price, timestamp, and label.
    fn get_price(&self, feed_id: &[u8]) -> OraclePrice;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal stub adapter for testing the trait machinery.
    struct StubAdapter;

    impl OracleAdapter for StubAdapter {
        fn feed_label(&self) -> &str {
            "StubAdapter"
        }

        fn get_price(&self, _feed_id: &[u8]) -> OraclePrice {
            OraclePrice {
                price: 42_000_000_000,
                timestamp: 1_700_000_000,
                feed_label: "StubAdapter TEST/USD".into(),
            }
        }
    }

    #[test]
    fn test_stub_adapter() {
        let adapter = StubAdapter;
        assert_eq!(adapter.feed_label(), "StubAdapter");

        let price = adapter.get_price(b"test_feed");
        assert_eq!(price.price, 42_000_000_000);
        assert_eq!(price.timestamp, 1_700_000_000);
    }
}
