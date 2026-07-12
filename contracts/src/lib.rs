// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Core Smart Contract Library (no_std)
//
// `OmniCheck` is the central security primitive. It cross-validates a
// Primary Oracle feed against a Fallback Oracle feed using safe fixed-point
// arithmetic, timestamp validation, and an automated circuit breaker.
//
// This crate is compiled with `#![no_std]` for maximum WASM efficiency.
// It uses `wee_alloc` as the global allocator and relies on the `alloc`
// crate for heap-allocated collections (String, Vec).
//
// # Architecture
//
// ```
// get_safe_price(primary_price, primary_ts, fallback_price, fallback_ts)
//       │
//       ├── 1. Validate inputs (non-zero prices, timestamps not in future)
//       ├── 2. Check staleness (primary & fallback vs max_staleness)
//       ├── 3. Compute deviation in basis points (safe i128 arithmetic)
//       ├── 4. Compare deviation vs threshold (default: 500 bps / 5%)
//       └── 5. Return safe price or panic with descriptive error
// ```
//
// # Usage
//
// ```ignore
// let config = ValidationConfig {
//     deviation_threshold_bps: 500,  // 5% maximum deviation
//     max_staleness_secs: 600,       // 10 minutes max staleness
// };
//
// let result = OmniCheck::get_safe_price(
//     &primary_price, &primary_ts,
//     &fallback_price, &fallback_ts,
//     &config,
// );
// ```
// ---------------------------------------------------------------------------

#![no_std]

// ---------------------------------------------------------------------------
// External crate linkage for no_std WASM environments
// ---------------------------------------------------------------------------
extern crate alloc;
extern crate wee_alloc;

// Use `wee_alloc` as the global allocator to minimize WASM binary size.
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// ---------------------------------------------------------------------------
// Module declarations
// ---------------------------------------------------------------------------
pub mod adapters;
pub mod error;
pub mod storage;

use alloc::string::String;
use serde::{Deserialize, Serialize};
use error::OracleError;
use storage::{InstanceStorage, TemporaryStorage, keys};

// ===========================================================================
// CORE CONFIGURATION
// ===========================================================================

/// Administration configuration for the OmniCheck validation engine.
///
/// This struct is intended to be stored in **Instance storage** (static,
/// global configuration) so that it persists across contract invocations
/// without polluting on-chain state with transient computation data.
///
/// # Fields
///
/// - `deviation_threshold_bps` — Maximum allowable price variance in basis
///   points (1 bp = 0.01%). Default: 500 (5%).
/// - `max_staleness_secs` — Maximum age (in seconds) of a price feed before
///   it is considered stale. Default: 600 (10 minutes).
/// - `is_locked` — Whether the circuit breaker has been tripped. When `true`,
///   all `get_safe_price` calls will return `OracleError::CircuitBreakerTripped`.
/// - `admin` — The administrator address authorized to reset the circuit
///   breaker and update configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationConfig {
    /// Maximum deviation threshold in basis points (1 bp = 0.01%).
    /// E.g., 500 = 5%.
    pub deviation_threshold_bps: i128,

    /// Maximum allowed age of a price feed in seconds.
    pub max_staleness_secs: u64,

    /// Circuit breaker lock state.
    pub is_locked: bool,

    /// Admin address authorized for override operations.
    pub admin: [u8; 32],
}

impl ValidationConfig {
    /// Creates a new `ValidationConfig` with safe production defaults.
    ///
    /// # Defaults
    /// - Deviation threshold: 500 bps (5%)
    /// - Max staleness: 600 seconds (10 minutes)
    /// - Circuit breaker: unlocked (not tripped)
    ///
    /// # Arguments
    /// - `admin` — The administrator's address (32 bytes).
    pub fn new(admin: [u8; 32]) -> Self {
        Self {
            deviation_threshold_bps: 500, // 5%
            max_staleness_secs: 600,      // 10 min
            is_locked: false,
            admin,
        }
    }

    /// Constructs a `ValidationConfig` with custom parameters.
    pub fn with_params(deviation_threshold_bps: i128, max_staleness_secs: u64, admin: [u8; 32]) -> Self {
        Self {
            deviation_threshold_bps,
            max_staleness_secs,
            is_locked: false,
            admin,
        }
    }
}

// ===========================================================================
// COMPUTATION RESULT
// ===========================================================================

/// The result of a successful `get_safe_price` validation.
///
/// Contains the validated primary price, computed deviation, and diagnostic
/// metadata that off-chain monitors can use for dashboards and alerts.
#[derive(Debug, Clone)]
pub struct SafePriceResult {
    /// The validated primary price (returned as the "safe" price).
    pub safe_price: i128,

    /// The computed absolute deviation in basis points between
    /// primary and fallback feeds.
    pub deviation_bps: i128,

    /// Human-readable summary of the validation outcome.
    pub diagnostic: String,
}

// ===========================================================================
// OMNICHECK ENGINE
// ===========================================================================

/// The `OmniCheck` struct implements the core consensus-routing and
/// circuit-breaker logic for cross-validating oracle price feeds.
///
/// This struct is stateless: all stateful configuration is passed in
/// via `ValidationConfig`. Computation results are returned directly
/// and never stored in long-term state (preventing state bloat).
pub struct OmniCheck;

impl OmniCheck {
    // -----------------------------------------------------------------------
    // PUBLIC API: get_safe_price (memory-only, no storage dependency)
    //
    // This function operates purely on provided parameters. It does NOT
    // read from or write to persistent storage. Use this when you want to
    // validate prices without affecting the circuit breaker lock state.
    //
    // For the storage-integrated flow (reads config from Instance storage,
    // auto-locks on violation), see `get_safe_price_with_storage`.
    // -----------------------------------------------------------------------

    /// Validates a Primary Oracle price against a Fallback Oracle price
    /// using fixed-point arithmetic, timestamp freshness checks, and
    /// deviation threshold enforcement.
    ///
    /// This is the **pure** variant — it does not interact with persistent
    /// storage. The caller is responsible for managing config state.
    ///
    /// # Arguments
    ///
    /// - `primary_price` — Price from the primary oracle feed (scaled i128).
    /// - `primary_timestamp` — Unix timestamp (seconds) of the primary feed's last update.
    /// - `fallback_price` — Price from the fallback oracle feed (same scale as primary).
    /// - `fallback_timestamp` — Unix timestamp (seconds) of the fallback feed's last update.
    /// - `current_time` — The current ledger/block timestamp.
    /// - `config` — The validation configuration (thresholds, lock state).
    ///
    /// # Returns
    ///
    /// - `Ok(SafePriceResult)` — The primary price passed all checks and is safe to use.
    /// - `Err(OracleError)` — A specific, descriptive error indicating which check failed.
    ///
    /// # Error Cases (checked in order)
    ///
    /// 1. `CircuitBreakerTripped` — The system is locked.
    /// 2. `InvalidPrice` — Either price is zero or negative.
    /// 3. `TimestampInFuture` — A feed timestamp exceeds `current_time`.
    /// 4. `PriceStalePrimary` — Primary timestamp exceeds staleness window.
    /// 5. `PriceStaleFallback` — Fallback timestamp exceeds staleness window.
    /// 6. `FeedsDiverged` — Price deviation exceeds threshold.
    pub fn get_safe_price(
        primary_price: i128,
        primary_timestamp: u64,
        fallback_price: i128,
        fallback_timestamp: u64,
        current_time: u64,
        config: &ValidationConfig,
    ) -> Result<SafePriceResult, OracleError> {
        // ---------------------------------------------------------------
        // Check 0: Circuit breaker lock state
        // ---------------------------------------------------------------
        if config.is_locked {
            return Err(OracleError::CircuitBreakerTripped {
                reason: String::from(
                    "Circuit breaker is locked. Admin override required.",
                ),
            });
        }

        // ---------------------------------------------------------------
        // Check 1: Input validation — prices must be positive
        // ---------------------------------------------------------------
        if primary_price <= 0 || fallback_price <= 0 {
            return Err(OracleError::InvalidPrice {
                primary_price,
                fallback_price,
            });
        }

        // ---------------------------------------------------------------
        // Check 2: Timestamps must not be in the future
        // ---------------------------------------------------------------
        if primary_timestamp > current_time {
            return Err(OracleError::TimestampInFuture {
                feed_timestamp: primary_timestamp,
                current_time,
            });
        }
        if fallback_timestamp > current_time {
            return Err(OracleError::TimestampInFuture {
                feed_timestamp: fallback_timestamp,
                current_time,
            });
        }

        // ---------------------------------------------------------------
        // Check 3: Primary staleness
        //
        // Compute the age of the primary feed. If it exceeds the configured
        // max staleness window, the primary cannot be trusted.
        // ---------------------------------------------------------------
        let primary_age: u64 = current_time.saturating_sub(primary_timestamp);
        if primary_age > config.max_staleness_secs {
            return Err(OracleError::PriceStalePrimary {
                feed_timestamp: primary_timestamp,
                current_time,
                max_staleness_secs: config.max_staleness_secs,
            });
        }

        // ---------------------------------------------------------------
        // Check 4: Fallback staleness
        //
        // The fallback is the safety net; if it's also stale, we have
        // no reliable reference point.
        // ---------------------------------------------------------------
        let fallback_age: u64 = current_time.saturating_sub(fallback_timestamp);
        if fallback_age > config.max_staleness_secs {
            return Err(OracleError::PriceStaleFallback {
                feed_timestamp: fallback_timestamp,
                current_time,
                max_staleness_secs: config.max_staleness_secs,
            });
        }

        // ---------------------------------------------------------------
        // Check 5: Deviation computation
        //
        // deviation_bps = (|primary - fallback| * 10_000) / primary
        //
        // This uses safe i128 arithmetic. Since we've already validated
        // that primary_price > 0, there's no division-by-zero risk.
        //
        // The multiplication by 10_000 comes before the division to
        // preserve precision (basis points = parts per 10,000).
        // ---------------------------------------------------------------
        let diff: i128 = if primary_price >= fallback_price {
            primary_price
                .checked_sub(fallback_price)
                .unwrap_or(0)
        } else {
            fallback_price
                .checked_sub(primary_price)
                .unwrap_or(0)
        };

        // Scale to basis points: (diff * 10_000) / primary_price
        let deviation_bps: i128 = diff
            .checked_mul(10_000)
            .and_then(|scaled| scaled.checked_div(primary_price))
            .unwrap_or(i128::MAX); // Overflow is effectively extreme divergence

        // ---------------------------------------------------------------
        // Check 6: Deviation threshold enforcement
        //
        // If the computed deviation exceeds the configured threshold,
        // the feeds have diverged beyond acceptable bounds.
        // ---------------------------------------------------------------
        if deviation_bps > config.deviation_threshold_bps {
            return Err(OracleError::FeedsDiverged {
                primary_price,
                fallback_price,
                deviation_bps,
                threshold_bps: config.deviation_threshold_bps,
            });
        }

        // ---------------------------------------------------------------
        // Success: all checks passed
        // ---------------------------------------------------------------
        Ok(SafePriceResult {
            safe_price: primary_price,
            deviation_bps,
            diagnostic: alloc::format!(
                "Validation passed: primary={}, fallback={}, deviation={} bps (threshold={} bps), primary_age={}s, fallback_age={}s",
                primary_price,
                fallback_price,
                deviation_bps,
                config.deviation_threshold_bps,
                primary_age,
                fallback_age,
            ),
        })
    }

    // -----------------------------------------------------------------------
    // ADMINISTRATIVE: Circuit breaker override reset
    //
    // In a real deployment, this function would:
    //   1. Verify the caller matches `config.admin` (multi-sig check).
    //   2. Unlock the circuit breaker.
    //
    // For the WASM primitives layer, we provide a pure function that
    // returns a new config with the lock cleared. The caller is
    // responsible for caller authentication in the host environment.
    // -----------------------------------------------------------------------

    /// Resets the circuit breaker lock state.
    ///
    /// Returns a new `ValidationConfig` with `is_locked` set to `false`.
    /// The caller **must** verify admin authorization before applying
    /// the returned config to storage.
    ///
    /// # Arguments
    /// - `config` — The current (possibly locked) configuration.
    /// - `caller` — The address of the account requesting the reset.
    ///
    /// # Returns
    /// - `Ok(ValidationConfig)` — A new unlocked configuration.
    /// - `Err(OracleError::Unauthorized)` — If `caller` ≠ `config.admin`.
    pub fn admin_override_reset(
        config: &ValidationConfig,
        caller: &[u8; 32],
    ) -> Result<ValidationConfig, OracleError> {
        if caller != &config.admin {
            return Err(OracleError::Unauthorized);
        }

        Ok(ValidationConfig {
            deviation_threshold_bps: config.deviation_threshold_bps,
            max_staleness_secs: config.max_staleness_secs,
            is_locked: false,
            admin: config.admin,
        })
    }

    // -----------------------------------------------------------------------
    // STORAGE-BACKED API: get_safe_price_with_storage
    //
    // This is the recommended method for production deployments. It:
    //   1. Reads the `ValidationConfig` from Instance storage.
    //   2. Runs the same validation logic as `get_safe_price`.
    //   3. On any violation error, **automatically locks the circuit breaker**
    //      by writing `is_locked = true` back to Instance storage.
    //   4. Writes diagnostic data to Temporary storage for event emission.
    //
    // This design keeps transient computation data out of long-term state
    // (Temporary storage) while persisting the critical lock flag in
    // Instance storage so the lock survives across contract invocations.
    // -----------------------------------------------------------------------

    /// Validates prices with automatic circuit-breaker locking.
    ///
    /// Reads configuration from `S: InstanceStorage`, validates the oracle
    /// feeds, and **automatically locks the circuit breaker** if any
    /// violation is detected.
    ///
    /// # Type Parameters
    /// - `S` — An implementor of `InstanceStorage` for reading/writing
    ///   persistent configuration.
    /// - `T` — An implementor of `TemporaryStorage` for ephemeral diagnostic
    ///   data that will not bloat permanent state.
    ///
    /// # Arguments
    /// - `instance_storage` — The instance storage backend.
    /// - `temp_storage` — The temporary storage backend.
    /// - `primary_price` — Primary oracle price (scaled i128).
    /// - `primary_timestamp` — Primary feed timestamp (Unix seconds).
    /// - `fallback_price` — Fallback oracle price (scaled i128).
    /// - `fallback_timestamp` — Fallback feed timestamp (Unix seconds).
    /// - `current_time` — Current ledger/block timestamp.
    ///
    /// # Storage Effects
    /// - **Reads** `cfg:validation_config` from Instance storage.
    /// - **Writes** `cfg:validation_config` (with `is_locked = true`) on violation.
    /// - **Writes** `tmp:last_diagnostic` to Temporary storage on every call.
    pub fn get_safe_price_with_storage<S: InstanceStorage, T: TemporaryStorage>(
        instance_storage: &S,
        temp_storage: &T,
        primary_price: i128,
        primary_timestamp: u64,
        fallback_price: i128,
        fallback_timestamp: u64,
        current_time: u64,
    ) -> Result<SafePriceResult, OracleError> {
        // ---------------------------------------------------------------
        // Step 1: Load configuration from Instance storage.
        //
        // In a real WASM deployment, this would deserialize JSON or
        // Borsh-encoded bytes from the host chain's key-value store.
        // For clarity, we deserialize from JSON using serde_json.
        // ---------------------------------------------------------------
        let config = Self::load_config_from_storage(instance_storage)?;

        // ---------------------------------------------------------------
        // Step 2: Run the pure validation logic.
        // ---------------------------------------------------------------
        let result = Self::get_safe_price(
            primary_price,
            primary_timestamp,
            fallback_price,
            fallback_timestamp,
            current_time,
            &config,
        );

        match result {
            Ok(safe_result) => {
                // Validation passed — store diagnostic in Temporary storage
                // (ephemeral, does not bloat permanent state).
                temp_storage.write_temporary(
                    keys::LAST_DIAGNOSTIC,
                    safe_result.diagnostic.as_bytes(),
                );
                Ok(safe_result)
            }
            Err(err) => {
                // -----------------------------------------------------------
                // VIOLATION DETECTED — AUTO-LOCK CIRCUIT BREAKER
                //
                // Persist the lock state to Instance storage so that
                // subsequent calls to any price validation will be
                // rejected until an admin performs an override reset.
                // -----------------------------------------------------------
                let mut locked_config = config.clone();
                locked_config.is_locked = true;
                Self::save_config_to_storage(instance_storage, &locked_config);

                // Store the error details in Temporary storage for
                // off-chain listeners to query via event emission.
                temp_storage.write_temporary(
                    keys::LAST_DIAGNOSTIC,
                    alloc::format!("CIRCUIT_BREAKER_TRIPPED: {}", err).as_bytes(),
                );

                Err(err)
            }
        }
    }

    // -----------------------------------------------------------------------
    // STORAGE HELPERS
    // -----------------------------------------------------------------------

    /// Loads the `ValidationConfig` from Instance storage.
    ///
    /// Returns a default configuration if no config has been stored yet.
    fn load_config_from_storage<S: InstanceStorage>(
        storage: &S,
    ) -> Result<ValidationConfig, OracleError> {
        match storage.read_instance(keys::CONFIG) {
            Some(bytes) => {
                serde_json::from_slice(&bytes).map_err(|_| {
                    OracleError::InvalidConfig {
                        field: String::from("validation_config"),
                        value: String::from("[corrupted bytes]"),
                        reason: String::from("Failed to deserialize stored configuration."),
                    }
                })
            }
            None => {
                // No config stored yet — the contract must be initialized
                // before any price validation can occur. This prevents
                // accidental usage with default (potentially unsafe) config.
                Err(OracleError::InvalidConfig {
                    field: String::from("validation_config"),
                    value: String::from("[not initialized]"),
                    reason: String::from(
                        "Contract not initialized. Call init_config before validating prices.",
                    ),
                })
            }
        }
    }

    /// Saves a `ValidationConfig` to Instance storage.
    fn save_config_to_storage<S: InstanceStorage>(
        storage: &S,
        config: &ValidationConfig,
    ) {
        // In production, use Borsh or a more compact encoding.
        // JSON is used here for readability and debugging.
        if let Ok(json) = serde_json::to_vec(config) {
            storage.write_instance(keys::CONFIG, &json);
        }
    }

    /// Initializes the contract configuration in Instance storage.
    ///
    /// Must be called once during contract deployment. Subsequent calls
    /// will overwrite the existing configuration, which should be
    /// restricted to the admin.
    ///
    /// # Arguments
    /// - `storage` — The instance storage backend.
    /// - `config` — The initial validation configuration.
    pub fn init_config<S: InstanceStorage>(
        storage: &S,
        config: &ValidationConfig,
    ) {
        Self::save_config_to_storage(storage, config);
    }

    /// Reads only the circuit breaker lock state from Instance storage.
    ///
    /// Useful for off-chain monitors that just need to check whether
    /// the system is currently locked without loading the full config.
    pub fn is_locked<S: InstanceStorage>(storage: &S) -> bool {
        Self::load_config_from_storage(storage)
            .map(|c| c.is_locked)
            .unwrap_or(false)
    }

    /// Updates the deviation threshold (admin-only).
    ///
    /// # Arguments
    /// - `config` — The current configuration.
    /// - `caller` — The address requesting the update.
    /// - `new_threshold_bps` — The new deviation threshold in basis points.
    pub fn admin_update_threshold(
        config: &ValidationConfig,
        caller: &[u8; 32],
        new_threshold_bps: i128,
    ) -> Result<ValidationConfig, OracleError> {
        if caller != &config.admin {
            return Err(OracleError::Unauthorized);
        }

        if new_threshold_bps <= 0 {
            return Err(OracleError::InvalidConfig {
                field: String::from("deviation_threshold_bps"),
                value: alloc::format!("{}", new_threshold_bps),
                reason: String::from("Deviation threshold must be a positive integer in basis points."),
            });
        }

        Ok(ValidationConfig {
            deviation_threshold_bps: new_threshold_bps,
            max_staleness_secs: config.max_staleness_secs,
            is_locked: config.is_locked,
            admin: config.admin,
        })
    }
}

// ===========================================================================
// TESTS
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Helper: create a default test config
    // -----------------------------------------------------------------------
    fn test_config() -> ValidationConfig {
        ValidationConfig::new([0x01; 32])
    }

    // -----------------------------------------------------------------------
    // Happy path tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_identical_prices_should_pass() {
        let config = test_config();
        let result = OmniCheck::get_safe_price(
            1_000_000_000, // primary price
            1_700_000_000, // primary timestamp
            1_000_000_000, // fallback price (identical)
            1_700_000_000, // fallback timestamp
            1_700_000_000, // current time
            &config,
        );
        assert!(result.is_ok(), "Identical prices should pass: {:?}", result.err());
        let safe = result.unwrap();
        assert_eq!(safe.deviation_bps, 0);
        assert_eq!(safe.safe_price, 1_000_000_000);
    }

    #[test]
    fn test_small_deviation_within_threshold() {
        let config = test_config();
        // 1% deviation = 100 basis points (below 500 bps threshold)
        let primary = 1_000_000_000;
        let fallback = 990_000_000; // 1% lower
        let result = OmniCheck::get_safe_price(
            primary,
            1_700_000_000,
            fallback,
            1_700_000_000,
            1_700_000_000,
            &config,
        );
        assert!(result.is_ok(), "1% deviation should pass");
        let safe = result.unwrap();
        assert_eq!(safe.safe_price, primary);
        assert_eq!(safe.deviation_bps, 100); // 1% = 100 bps
    }

    #[test]
    fn test_deviation_at_threshold_boundary() {
        let config = test_config(); // 500 bps threshold
        // Exactly 5% deviation = 500 bps
        let primary = 1_000_000_000;
        let fallback = 950_000_000; // 5% lower
        let result = OmniCheck::get_safe_price(
            primary,
            1_700_000_000,
            fallback,
            1_700_000_000,
            1_700_000_000,
            &config,
        );
        // 5% = 500 bps. threshold is 500, and we check > 500, so 500 should pass
        assert!(result.is_ok(), "Exact threshold deviation should pass");
    }

    #[test]
    fn test_fresh_timestamps_at_edge_of_staleness() {
        let config = test_config(); // 600s max staleness
        let result = OmniCheck::get_safe_price(
            1_000_000_000,
            1_700_000_000 - 600, // exactly at max staleness
            1_000_000_000,
            1_700_000_000 - 600, // fallback also at max staleness
            1_700_000_000,
            &config,
        );
        assert!(result.is_ok(), "Edge-of-staleness should pass");
    }

    // -----------------------------------------------------------------------
    // Error path tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_circuit_breaker_locked() {
        let mut config = test_config();
        config.is_locked = true;
        let result = OmniCheck::get_safe_price(
            1_000_000_000, 1_700_000_000,
            1_000_000_000, 1_700_000_000,
            1_700_000_000,
            &config,
        );
        assert!(matches!(result, Err(OracleError::CircuitBreakerTripped { .. })));
    }

    #[test]
    fn test_zero_primary_price() {
        let config = test_config();
        let result = OmniCheck::get_safe_price(
            0, 1_700_000_000,   // zero primary
            1_000_000_000, 1_700_000_000,
            1_700_000_000,
            &config,
        );
        assert!(matches!(result, Err(OracleError::InvalidPrice { .. })));
    }

    #[test]
    fn test_negative_fallback_price() {
        let config = test_config();
        let result = OmniCheck::get_safe_price(
            1_000_000_000, 1_700_000_000,
            -1, 1_700_000_000,  // negative fallback
            1_700_000_000,
            &config,
        );
        assert!(matches!(result, Err(OracleError::InvalidPrice { .. })));
    }

    #[test]
    fn test_primary_timestamp_in_future() {
        let config = test_config();
        let result = OmniCheck::get_safe_price(
            1_000_000_000, 1_700_000_100,  // 100s in future
            1_000_000_000, 1_700_000_000,
            1_700_000_000,
            &config,
        );
        assert!(matches!(result, Err(OracleError::TimestampInFuture { .. })));
    }

    #[test]
    fn test_primary_stale() {
        let config = test_config(); // max_staleness = 600
        let result = OmniCheck::get_safe_price(
            1_000_000_000, 1_700_000_000 - 601,  // 601s old
            1_000_000_000, 1_700_000_000,
            1_700_000_000,
            &config,
        );
        assert!(matches!(result, Err(OracleError::PriceStalePrimary { .. })));
    }

    #[test]
    fn test_fallback_stale() {
        let config = test_config();
        let result = OmniCheck::get_safe_price(
            1_000_000_000, 1_700_000_000,
            1_000_000_000, 1_700_000_000 - 601,  // fallback 601s old
            1_700_000_000,
            &config,
        );
        assert!(matches!(result, Err(OracleError::PriceStaleFallback { .. })));
    }

    #[test]
    fn test_feeds_diverged_exceeds_threshold() {
        let config = test_config(); // 500 bps (5%) threshold
        // 10% deviation = 1000 bps
        let result = OmniCheck::get_safe_price(
            1_000_000_000,
            1_700_000_000,
            900_000_000,  // 10% lower
            1_700_000_000,
            1_700_000_000,
            &config,
        );
        match result {
            Err(OracleError::FeedsDiverged { deviation_bps, threshold_bps, .. }) => {
                assert_eq!(deviation_bps, 1000);
                assert_eq!(threshold_bps, 500);
            }
            other => panic!("Expected FeedsDiverged, got {:?}", other),
        }
    }

    // -----------------------------------------------------------------------
    // Admin function tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_admin_override_reset_authorized() {
        let admin = [0x42; 32];
        let config = ValidationConfig {
            deviation_threshold_bps: 500,
            max_staleness_secs: 600,
            is_locked: true,
            admin,
        };
        let result = OmniCheck::admin_override_reset(&config, &admin);
        assert!(result.is_ok());
        assert!(!result.unwrap().is_locked);
    }

    #[test]
    fn test_admin_override_reset_unauthorized() {
        let admin = [0x42; 32];
        let attacker = [0xFF; 32];
        let config = ValidationConfig {
            deviation_threshold_bps: 500,
            max_staleness_secs: 600,
            is_locked: true,
            admin,
        };
        let result = OmniCheck::admin_override_reset(&config, &attacker);
        assert!(matches!(result, Err(OracleError::Unauthorized)));
    }

    #[test]
    fn test_admin_update_threshold() {
        let admin = [0xAA; 32];
        let config = ValidationConfig::new(admin);
        let result = OmniCheck::admin_update_threshold(&config, &admin, 100);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().deviation_threshold_bps, 100);
    }

    #[test]
    fn test_admin_update_threshold_unauthorized() {
        let admin = [0xAA; 32];
        let attacker = [0xBB; 32];
        let config = ValidationConfig::new(admin);
        let result = OmniCheck::admin_update_threshold(&config, &attacker, 100);
        assert!(matches!(result, Err(OracleError::Unauthorized)));
    }

    // -----------------------------------------------------------------------
    // Edge case tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_very_large_prices() {
        let config = test_config();
        let result = OmniCheck::get_safe_price(
            i128::MAX / 2,
            1_700_000_000,
            i128::MAX / 2,
            1_700_000_000,
            1_700_000_000,
            &config,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_maximum_deviation_extreme() {
        let config = test_config(); // 500 bps
        // Primary = 1, Fallback = 1 billion → extreme deviation
        let result = OmniCheck::get_safe_price(
            1,
            1_700_000_000,
            1_000_000_000,
            1_700_000_000,
            1_700_000_000,
            &config,
        );
        assert!(matches!(result, Err(OracleError::FeedsDiverged { .. })));
    }

    #[test]
    fn test_config_defaults() {
        let config = ValidationConfig::new([0x07; 32]);
        assert_eq!(config.deviation_threshold_bps, 500);
        assert_eq!(config.max_staleness_secs, 600);
        assert!(!config.is_locked);
    }
}
