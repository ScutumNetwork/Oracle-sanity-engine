// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Soroban Smart Contract
//
// `OmniCheckContract` is the on-chain security primitive for Stellar/Soroban.
// It cross-validates a Primary Oracle feed against a Fallback Oracle feed
// using safe fixed-point arithmetic, timestamp validation, and an automated
// circuit breaker.
//
// # Entry Points
//
//   init(admin, deviation_threshold_bps, max_staleness_secs)
//     — Initialize the contract with admin and validation parameters.
//
//   get_safe_price(primary_price, primary_ts, fallback_price, fallback_ts)
//     — Validate prices. Auto-locks the circuit breaker on violation.
//
//   is_locked() -> bool
//     — Check if the circuit breaker is currently tripped.
//
//   admin_override_reset()
//     — Admin-only: unlock the circuit breaker.
//
//   admin_update_threshold(new_threshold_bps)
//     — Admin-only: update the deviation threshold.
//
// # Architecture
//
//   get_safe_price(primary, fallback, timestamps)
//       │
//       ├── 1. Load config from instance storage
//       ├── 2. Check circuit breaker lock state
//       ├── 3. Validate inputs (non-zero, timestamps not in future)
//       ├── 4. Check staleness (primary & fallback vs max_staleness)
//       ├── 5. Compute deviation in basis points (safe i128 arithmetic)
//       ├── 6. Compare deviation vs threshold
//       └── 7. Return safe price or auto-lock + return error
// ---------------------------------------------------------------------------

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

pub use error::OracleError;

mod error;

// ===========================================================================
// STORAGE TYPES & KEYS
// ===========================================================================

/// Well-known storage keys for instance and temporary storage.
const KEY_ADMIN: Symbol = symbol_short!("admin");
const KEY_CONFIG: Symbol = symbol_short!("config");
const KEY_IS_LOCKED: Symbol = symbol_short!("locked");
const KEY_LAST_DIAG: Symbol = symbol_short!("last_diag");

/// Validation configuration stored in instance storage.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidationConfig {
    /// Maximum deviation threshold in basis points (1 bp = 0.01%).
    pub deviation_threshold_bps: i128,
    /// Maximum allowed age of a price feed in seconds.
    pub max_staleness_secs: u64,
}

/// The result of a successful price validation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SafePriceResult {
    /// The validated primary price.
    pub safe_price: i128,
    /// The computed deviation in basis points.
    pub deviation_bps: i128,
}

// ===========================================================================
// CONTRACT
// ===========================================================================

#[contract]
pub struct OmniCheckContract;

#[contractimpl]
impl OmniCheckContract {
    // -----------------------------------------------------------------------
    // INITIALIZATION
    // -----------------------------------------------------------------------

    /// Initializes the contract with admin and validation parameters.
    ///
    /// Must be called once during deployment. The caller becomes the admin.
    ///
    /// # Arguments
    /// - `admin` — The administrator address authorized for override operations.
    /// - `deviation_threshold_bps` — Max allowed deviation in basis points (e.g., 500 = 5%).
    /// - `max_staleness_secs` — Max age of a price feed before considered stale.
    pub fn init(
        env: Env,
        admin: Address,
        deviation_threshold_bps: i128,
        max_staleness_secs: u64,
    ) {
        // Require admin's signature for initialization
        admin.require_auth();

        // Validate parameters
        if deviation_threshold_bps <= 0 {
            panic!("deviation_threshold_bps must be positive");
        }
        if max_staleness_secs == 0 {
            panic!("max_staleness_secs must be positive");
        }

        // Store admin
        env.storage().instance().set(&KEY_ADMIN, &admin);

        // Store config
        let config = ValidationConfig {
            deviation_threshold_bps,
            max_staleness_secs,
        };
        env.storage().instance().set(&KEY_CONFIG, &config);

        // Initialize lock state
        env.storage().instance().set(&KEY_IS_LOCKED, &false);
    }

    // -----------------------------------------------------------------------
    // PRICE VALIDATION
    // -----------------------------------------------------------------------

    /// Validates a Primary Oracle price against a Fallback Oracle price.
    ///
    /// This is the main entry point for oracle cross-validation. It:
    ///   1. Loads config from instance storage
    ///   2. Checks the circuit breaker lock state
    ///   3. Validates inputs and timestamps
    ///   4. Computes deviation in basis points
    ///   5. Auto-locks the circuit breaker if any check fails
    ///
    /// # Arguments
    /// - `primary_price` — Price from the primary oracle feed (scaled i128).
    /// - `primary_timestamp` — Unix timestamp (seconds) of the primary feed.
    /// - `fallback_price` — Price from the fallback oracle feed.
    /// - `fallback_timestamp` — Unix timestamp (seconds) of the fallback feed.
    ///
    /// # Returns
    /// - `Ok(SafePriceResult)` — Validation passed. The primary price is safe to use.
    /// - `Err(OracleError)` — Validation failed with a specific error code.
    pub fn get_safe_price(
        env: Env,
        primary_price: i128,
        primary_timestamp: u64,
        fallback_price: i128,
        fallback_timestamp: u64,
    ) -> Result<SafePriceResult, OracleError> {
        // Load config (error if not initialized)
        let config = Self::load_config(&env)?;

        // Check circuit breaker lock
        if Self::is_locked_internal(&env) {
            return Err(OracleError::CircuitBreakerTripped);
        }

        // Get current ledger timestamp
        let current_time = env.ledger().timestamp();

        // Run validation
        let result = Self::validate_prices(
            primary_price,
            primary_timestamp,
            fallback_price,
            fallback_timestamp,
            current_time,
            &config,
        );

        match result {
            Ok(safe_result) => {
                // Store diagnostic in temporary storage (auto-expires)
                env.storage().temporary().set(&KEY_LAST_DIAG, &safe_result.deviation_bps);
                // Extend TTL so it lives long enough for event emission
                env.storage().temporary().extend_ttl(&KEY_LAST_DIAG, 100, 100);
                Ok(safe_result)
            }
            Err(err) => {
                // AUTO-LOCK: persist lock state to instance storage
                env.storage().instance().set(&KEY_IS_LOCKED, &true);

                // Store error diagnostic in temporary storage
                let error_code = err as u32;
                env.storage().temporary().set(&KEY_LAST_DIAG, &(error_code as i128));
                env.storage().temporary().extend_ttl(&KEY_LAST_DIAG, 100, 100);

                Err(err)
            }
        }
    }

    // -----------------------------------------------------------------------
    // QUERIES
    // -----------------------------------------------------------------------

    /// Returns whether the circuit breaker is currently tripped.
    pub fn is_locked(env: Env) -> bool {
        Self::is_locked_internal(&env)
    }

    /// Returns the current deviation threshold (basis points) and
    /// max staleness (seconds), or an error if not initialized.
    pub fn get_config(env: Env) -> Result<ValidationConfig, OracleError> {
        Self::load_config(&env)
    }

    /// Returns the last diagnostic value from temporary storage.
    /// This could be the last deviation (in bps) or the last error code.
    pub fn get_last_diagnostic(env: Env) -> Option<i128> {
        env.storage().temporary().get(&KEY_LAST_DIAG)
    }

    // -----------------------------------------------------------------------
    // ADMIN: Override Reset
    // -----------------------------------------------------------------------

    /// Admin-only: unlocks the circuit breaker.
    ///
    /// Requires the admin's signature. After unlocking, normal price
    /// validation can resume.
    pub fn admin_override_reset(env: Env) -> Result<(), OracleError> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();

        env.storage().instance().set(&KEY_IS_LOCKED, &false);

        // Clear diagnostic
        env.storage().temporary().remove(&KEY_LAST_DIAG);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // ADMIN: Update Threshold
    // -----------------------------------------------------------------------

    /// Admin-only: updates the deviation threshold.
    ///
    /// # Arguments
    /// - `new_threshold_bps` — New max deviation in basis points. Must be positive.
    pub fn admin_update_threshold(
        env: Env,
        new_threshold_bps: i128,
    ) -> Result<(), OracleError> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();

        if new_threshold_bps <= 0 {
            return Err(OracleError::InvalidConfig);
        }

        let mut config = Self::load_config(&env)?;
        config.deviation_threshold_bps = new_threshold_bps;
        env.storage().instance().set(&KEY_CONFIG, &config);

        Ok(())
    }

    /// Admin-only: updates the max staleness window.
    ///
    /// # Arguments
    /// - `new_max_staleness_secs` — New max staleness in seconds. Must be positive.
    pub fn admin_update_staleness(
        env: Env,
        new_max_staleness_secs: u64,
    ) -> Result<(), OracleError> {
        let admin = Self::require_admin(&env)?;
        admin.require_auth();

        if new_max_staleness_secs == 0 {
            return Err(OracleError::InvalidConfig);
        }

        let mut config = Self::load_config(&env)?;
        config.max_staleness_secs = new_max_staleness_secs;
        env.storage().instance().set(&KEY_CONFIG, &config);

        Ok(())
    }

    // =======================================================================
    // INTERNAL HELPERS
    // =======================================================================

    /// Loads the ValidationConfig from instance storage.
    fn load_config(env: &Env) -> Result<ValidationConfig, OracleError> {
        env.storage()
            .instance()
            .get(&KEY_CONFIG)
            .ok_or(OracleError::NotInitialized)
    }

    /// Returns the admin address, or Unauthorized if not set.
    fn require_admin(env: &Env) -> Result<Address, OracleError> {
        env.storage()
            .instance()
            .get(&KEY_ADMIN)
            .ok_or(OracleError::Unauthorized)
    }

    /// Checks the circuit breaker lock state.
    fn is_locked_internal(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&KEY_IS_LOCKED)
            .unwrap_or(false)
    }

    /// Pure validation logic (no storage interaction).
    ///
    /// Returns `Ok(SafePriceResult)` if all checks pass, or an `OracleError`.
    fn validate_prices(
        primary_price: i128,
        primary_timestamp: u64,
        fallback_price: i128,
        fallback_timestamp: u64,
        current_time: u64,
        config: &ValidationConfig,
    ) -> Result<SafePriceResult, OracleError> {
        // ---------------------------------------------------------------
        // Check 1: Prices must be positive
        // ---------------------------------------------------------------
        if primary_price <= 0 || fallback_price <= 0 {
            return Err(OracleError::InvalidPrice);
        }

        // ---------------------------------------------------------------
        // Check 2: Timestamps must not be in the future
        // ---------------------------------------------------------------
        if primary_timestamp > current_time || fallback_timestamp > current_time {
            return Err(OracleError::TimestampInFuture);
        }

        // ---------------------------------------------------------------
        // Check 3: Primary staleness
        // ---------------------------------------------------------------
        let primary_age = current_time.saturating_sub(primary_timestamp);
        if primary_age > config.max_staleness_secs {
            return Err(OracleError::PriceStalePrimary);
        }

        // ---------------------------------------------------------------
        // Check 4: Fallback staleness
        // ---------------------------------------------------------------
        let fallback_age = current_time.saturating_sub(fallback_timestamp);
        if fallback_age > config.max_staleness_secs {
            return Err(OracleError::PriceStaleFallback);
        }

        // ---------------------------------------------------------------
        // Check 5: Compute deviation
        //
        // deviation_bps = (|primary - fallback| * 10_000) / primary
        // ---------------------------------------------------------------
        let diff = if primary_price >= fallback_price {
            primary_price.saturating_sub(fallback_price)
        } else {
            fallback_price.saturating_sub(primary_price)
        };

        // Scale to basis points
        let deviation_bps = diff
            .checked_mul(10_000)
            .and_then(|scaled| scaled.checked_div(primary_price))
            .unwrap_or(i128::MAX);

        // ---------------------------------------------------------------
        // Check 6: Deviation threshold
        // ---------------------------------------------------------------
        if deviation_bps > config.deviation_threshold_bps {
            return Err(OracleError::FeedsDiverged);
        }

        // ---------------------------------------------------------------
        // Success
        // ---------------------------------------------------------------
        Ok(SafePriceResult {
            safe_price: primary_price,
            deviation_bps,
        })
    }
}

// ===========================================================================
// TESTS
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
use soroban_sdk::{Address, Env};

    fn setup_test() -> (Env, Address, OmniCheckContractClient) {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract_id = env.register(OmniCheckContract, ());
        let client = OmniCheckContractClient::new(&env, &contract_id);

        // Initialize with standard params: 500 bps (5%), 600s staleness
        client.init(&admin, &500, &600);
        (env, admin, client)
    }

    #[test]
    fn test_init_and_get_config() {
        let (_env, admin, client) = setup_test();
        let config = client.get_config();
        assert_eq!(config.deviation_threshold_bps, 500);
        assert_eq!(config.max_staleness_secs, 600);
        assert!(!client.is_locked());
    }

    #[test]
    fn test_identical_prices_pass() {
        let (_env, _admin, client) = setup_test();
        let result = client.get_safe_price(
            &1_000_000_000,
            &1_700_000_000,
            &1_000_000_000,
            &1_700_000_000,
        );
        assert!(result.is_ok());
        let safe = result.unwrap();
        assert_eq!(safe.deviation_bps, 0);
        assert_eq!(safe.safe_price, 1_000_000_000);
    }

    #[test]
    fn test_small_deviation_passes() {
        let (_env, _admin, client) = setup_test();
        // 1% deviation = 100 bps (< 500 threshold)
        let result = client.get_safe_price(
            &1_000_000_000,
            &1_700_000_000,
            &990_000_000,
            &1_700_000_000,
        );
        assert!(result.is_ok());
        assert_eq!(result.unwrap().deviation_bps, 100);
    }

    #[test]
    fn test_large_deviation_fails_and_locks() {
        let (_env, _admin, client) = setup_test();
        // 10% deviation = 1000 bps (> 500 threshold)
        let result = client.get_safe_price(
            &1_000_000_000,
            &1_700_000_000,
            &900_000_000,
            &1_700_000_000,
        );
        assert!(result.is_err());

        // Circuit breaker should now be locked
        assert!(client.is_locked());

        // Subsequent calls should be rejected
        let result2 = client.get_safe_price(
            &1_000_000_000,
            &1_700_000_000,
            &1_000_000_000,
            &1_700_000_000,
        );
        assert!(result2.is_err());
    }

    #[test]
    fn test_admin_override_reset() {
        let (env, admin, client) = setup_test();

        // Trip the circuit breaker
        let _ = client.get_safe_price(
            &1_000_000_000,
            &1_700_000_000,
            &900_000_000,
            &1_700_000_000,
        );
        assert!(client.is_locked());

        // Admin resets
        client.admin_override_reset();
        assert!(!client.is_locked());
    }

    #[test]
    fn test_admin_update_threshold() {
        let (_env, _admin, client) = setup_test();
        client.admin_update_threshold(&200);

        let config = client.get_config();
        assert_eq!(config.deviation_threshold_bps, 200);
    }

    #[test]
    fn test_stale_primary_fails() {
        let (_env, _admin, client) = setup_test();
        let result = client.get_safe_price(
            &1_000_000_000,
            &1_700_000_000 - 601, // 601s old > 600s max
            &1_000_000_000,
            &1_700_000_000,
        );
        assert!(result.is_err());
        assert!(client.is_locked());
    }

    #[test]
    fn test_zero_price_fails() {
        let (_env, _admin, client) = setup_test();
        let result = client.get_safe_price(
            &0,
            &1_700_000_000,
            &1_000_000_000,
            &1_700_000_000,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_future_timestamp_fails() {
        let (_env, _admin, client) = setup_test();
        let result = client.get_safe_price(
            &1_000_000_000,
            &1_700_000_000 + 100, // 100s in future
            &1_000_000_000,
            &1_700_000_000,
        );
        assert!(result.is_err());
    }
}
