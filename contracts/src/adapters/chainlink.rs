// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Chainlink Price Feed Adapter (Soroban-compatible)
//
// Reference implementation of the `OracleAdapter` trait for Chainlink Data Feeds.
// In production, price data would be passed to the contract by an off-chain
// relayer; this adapter serves as a pattern for decoding Chainlink data.
// ---------------------------------------------------------------------------

use super::{OracleAdapter, OraclePrice};

/// Chainlink price feed adapter.
///
/// Returns a deterministic mock price derived from the requested `feed_id`.
/// In a real deployment this would decode the Chainlink aggregator's on-chain
/// storage for the given feed instead of returning mock data.
pub struct ChainlinkAdapter;

impl ChainlinkAdapter {
    /// Mock price in 8-decimal fixed-point notation (e.g. `2_000_000_000_000`
    /// represents `20_000.00000000`). Different feed ids return different
    /// prices so callers can observe the adapter distinguishing feeds.
    fn mock_price(feed_id: u64) -> i128 {
        2_000_000_000_000 + i128::from(feed_id)
    }
}

impl OracleAdapter for ChainlinkAdapter {
    fn get_price(&self, feed_id: u64) -> OraclePrice {
        OraclePrice {
            price: Self::mock_price(feed_id),
            timestamp: 1_700_000_000,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::adapters::chainlink::ChainlinkAdapter;
    use crate::adapters::OracleAdapter;

    #[test]
    fn test_price_is_deterministic_for_a_given_feed() {
        let adapter = ChainlinkAdapter;
        assert_eq!(adapter.get_price(42).price, adapter.get_price(42).price);
    }

    #[test]
    fn test_price_derives_from_feed_id() {
        let adapter = ChainlinkAdapter;
        let a = adapter.get_price(1);
        let b = adapter.get_price(2);

        assert_ne!(a.price, b.price);
        assert_eq!(a.price, 2_000_000_000_001);
        assert_eq!(b.price, 2_000_000_000_002);
    }

    #[test]
    fn test_timestamp_is_set() {
        let adapter = ChainlinkAdapter;
        assert_eq!(adapter.get_price(7).timestamp, 1_700_000_000);
    }
}
