// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Reflector Oracle Adapter (Soroban-native)
//
// Reference implementation of the `OracleAdapter` trait for Reflector's
// Soroban oracle interface. Reflector provides price feeds on Stellar with
// native Soroban contract integration.
//
// In production, price data would be passed to the contract by an off-chain
// relayer; this adapter serves as a pattern for decoding Reflector data.
// ---------------------------------------------------------------------------

use super::{OracleAdapter, OraclePrice};

/// Reflector price feed adapter.
///
/// Returns a deterministic mock price derived from the requested `feed_id`.
/// In a real deployment this would decode the Reflector contract's on-chain
/// storage for the given feed instead of returning mock data.
pub struct ReflectorAdapter;

impl ReflectorAdapter {
    /// Mock price in Stellar STROOP precision (10^7) or derivative precision (10^14).
    /// Different feed ids return different prices so callers can observe the
    /// adapter distinguishing feeds.
    fn mock_price(feed_id: u64) -> i128 {
        // Base price scaled to 10^7 (STROOP precision)
        // Example: $20,000.00 = 200000000000 (20,000 * 10^7)
        const BASE_PRICE: i128 = 200_000_000_000; // $20,000 in STROOP
        BASE_PRICE + i128::from(feed_id) * 1_000_000
    }
}

impl OracleAdapter for ReflectorAdapter {
    fn get_price(&self, feed_id: u64) -> OraclePrice {
        OraclePrice {
            price: Self::mock_price(feed_id),
            timestamp: 1_700_000_000,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::adapters::reflector::ReflectorAdapter;
    use crate::adapters::OracleAdapter;

    #[test]
    fn test_price_is_deterministic_for_a_given_feed() {
        let adapter = ReflectorAdapter;
        assert_eq!(adapter.get_price(42).price, adapter.get_price(42).price);
    }

    #[test]
    fn test_price_derives_from_feed_id() {
        let adapter = ReflectorAdapter;
        let a = adapter.get_price(1);
        let b = adapter.get_price(2);

        assert_ne!(a.price, b.price);
        assert_eq!(a.price, 200_001_000_000);
        assert_eq!(b.price, 200_002_000_000);
    }

    #[test]
    fn test_timestamp_is_set() {
        let adapter = ReflectorAdapter;
        assert_eq!(adapter.get_price(7).timestamp, 1_700_000_000);
    }
}
