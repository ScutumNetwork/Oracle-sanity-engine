// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Chainlink Price Feed Adapter (Soroban-compatible)
//
// Reference implementation of the `OracleAdapter` trait for Chainlink Data Feeds.
// In production, price data would be passed to the contract by an off-chain
// relayer; this adapter serves as a pattern for decoding Chainlink data.
// ---------------------------------------------------------------------------

use super::{OracleAdapter, OraclePrice};

/// Chainlink price feed adapter.
pub struct ChainlinkAdapter;

impl OracleAdapter for ChainlinkAdapter {
    fn get_price(&self, _feed_id: u64) -> OraclePrice {
        // In production, this would decode Chainlink aggregator storage.
        // Mock values for reference implementation.
        OraclePrice {
            price: 2_000_50_000_000,
            timestamp: 1_700_000_000,
        }
    }
}
