// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Pluggable Adapter Framework (Soroban-compatible)
//
// This module defines the `OracleAdapter` trait: a standardized interface
// that every oracle integration must implement. Community contributors can
// easily add support for new oracle networks (Chainlink, Pyth, Band Protocol,
// TWAP, RedStone, etc.) by implementing this trait.
//
// Note: In a Soroban deployment, oracle prices are typically passed as
// arguments to `get_safe_price` rather than fetched via cross-contract calls
// within the validation contract. These adapters serve as reference patterns
// for off-chain relayers and oracle abstraction layers.
// ---------------------------------------------------------------------------

pub mod chainlink;

use soroban_sdk::contracttype;

// ---------------------------------------------------------------------------
// OraclePrice — Universal Price Feed Result
// ---------------------------------------------------------------------------

/// A normalized price feed result that every adapter must produce.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OraclePrice {
    /// The asset price, scaled to a fixed-point representation.
    pub price: i128,
    /// Unix timestamp (seconds) of when this price was last updated on-chain.
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// OracleAdapter Trait
// ---------------------------------------------------------------------------

/// The core interface for any oracle price feed adapter.
///
/// Implementors of this trait plug into the `OmniCheck` engine and provide
/// normalized price data. Each adapter is responsible for decoding the raw
/// on-chain data from its respective oracle and returning an `OraclePrice`.
pub trait OracleAdapter {
    /// Returns the current price from the oracle.
    ///
    /// # Arguments
    /// - `feed_id` — An adapter-specific identifier for the price feed.
    fn get_price(&self, feed_id: u64) -> OraclePrice;
}
