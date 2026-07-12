// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Chainlink Price Feed Adapter
//
// This adapter provides a reference implementation of the `OracleAdapter`
// trait for **Chainlink Data Feeds**.
//
// Chainlink aggregators expose a `latestRoundData()` view that returns:
//   (roundId, answer, startedAt, updatedAt, answeredInRound)
//
// This adapter demonstrates the decoding pattern. In a real WASM deployment
// the adapter would perform a cross-contract call to the aggregator's
// `latestRoundData` endpoint. For on-chain WASM environments (e.g. NEAR,
// Polkadot ink!, or CosmWasm), the cross-contract call mechanism varies;
// this module provides an abstracted interface that can be adapted.
//
// ---------------------------------------------------------------------------

use super::{OracleAdapter, OraclePrice};

/// Chainlink price feed adapter.
///
/// # Usage
///
/// ```ignore
/// let adapter = ChainlinkAdapter::new("ETH/USD");
/// let price = adapter.get_price(&aggregator_address_bytes);
/// ```
pub struct ChainlinkAdapter {
    /// Human-readable label for this adapter instance.
    label: String,
}

impl ChainlinkAdapter {
    /// Creates a new Chainlink adapter for a given asset pair.
    ///
    /// # Arguments
    /// - `pair` — The trading pair label, e.g., "ETH/USD", "BTC/USD".
    pub fn new(pair: &str) -> Self {
        Self {
            label: alloc::format!("Chainlink {}", pair),
        }
    }
}

impl OracleAdapter for ChainlinkAdapter {
    fn feed_label(&self) -> &str {
        &self.label
    }

    fn get_price(&self, feed_id: &[u8]) -> OraclePrice {
        // -------------------------------------------------------------------
        // In a real WASM deployment, this function would:
        //
        // 1. Deserialize `feed_id` into an aggregator contract address.
        // 2. Perform a cross-contract call to `aggregator.latestRoundData()`.
        // 3. Parse the returned `(roundId, answer, startedAt, updatedAt, answeredInRound)`.
        // 4. Return `OraclePrice { price: answer, timestamp: updatedAt, ... }`.
        //
        // The following is a mock implementation for demonstration. In a
        // production environment, replace this with the actual cross-contract
        // call mechanism appropriate for the target chain (e.g., NEAR
        // `Promise`, ink! `CrossCalling`, or CosmWasm `WasmQuery`).
        // -------------------------------------------------------------------

        // Mock: pretend the aggregator returned these values
        let _aggregator = feed_id; // would be the contract address
        let mock_price: i128 = 2_000_50_000_000; // $2,000.50 (scaled by 1e8 for Chainlink convention)
        let mock_timestamp: u64 = 1_700_000_000;

        OraclePrice {
            price: mock_price,
            timestamp: mock_timestamp,
            feed_label: self.label.clone(),
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
    fn test_chainlink_adapter_label() {
        let adapter = ChainlinkAdapter::new("ETH/USD");
        assert_eq!(adapter.feed_label(), "Chainlink ETH/USD");
    }

    #[test]
    fn test_chainlink_get_price() {
        let adapter = ChainlinkAdapter::new("BTC/USD");
        let price = adapter.get_price(&[0u8; 20]); // mock aggregator address
        assert!(price.price > 0);
        assert!(price.timestamp > 0);
        assert_eq!(price.feed_label, "Chainlink BTC/USD");
    }
}
