// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Storage & TTL Management (Soroban-native)
//
// This module partitions contract storage into:
// - Instance storage: For configuration state (max_deviation_bps, max_staleness, admin)
// - Temporary storage: For short-term price state (diagnostics, last prices)
//
// Soroban requires explicit TTL management. This module provides helpers to
// bump storage TTL on every execution to prevent data eviction.
// ---------------------------------------------------------------------------

use soroban_sdk::{Env, Symbol};

use crate::error::OracleError;

// ===========================================================================
// STORAGE KEYS - Instance Storage (Persistent Configuration)
// ===========================================================================

/// Admin address authorized for override operations.
const KEY_ADMIN: Symbol = Symbol::short("admin");

/// Validation configuration (deviation threshold, staleness window).
const KEY_CONFIG: Symbol = Symbol::short("config");

/// Circuit breaker lock state (true = tripped, false = normal).
const KEY_IS_LOCKED: Symbol = Symbol::short("locked");

// ===========================================================================
// STORAGE KEYS - Temporary Storage (Short-lived Price State)
// ===========================================================================

/// Last diagnostic value (deviation in bps or error code).
const KEY_LAST_DIAG: Symbol = Symbol::short("last_diag");

/// Last validated primary price (for quick reference).
const KEY_LAST_PRIMARY_PRICE: Symbol = Symbol::short("last_pri");

/// Last validated fallback price (for quick reference).
const KEY_LAST_FALLBACK_PRICE: Symbol = Symbol::short("last_fal");

/// Timestamp of the last successful validation.
const KEY_LAST_VALIDATION_TS: Symbol = Symbol::short("last_val");

// ===========================================================================
// TTL CONSTANTS
// ===========================================================================

/// Minimum TTL to extend for instance storage (ledgers).
/// Instance storage should persist for long periods (e.g., 30 days).
const INSTANCE_TTL_LEDGERS: u32 = 259_200; // ~30 days at 10s per ledger

/// Minimum TTL to extend for temporary storage (ledgers).
/// Temporary storage can have shorter TTL (e.g., 1 day).
const TEMP_TTL_LEDGERS: u32 = 8_640; // ~1 day at 10s per ledger

/// Threshold to trigger TTL extension (ledgers).
/// Extend TTL when remaining TTL falls below this threshold.
const TTL_EXTENSION_THRESHOLD: u32 = 4_320; // ~12 hours

// ===========================================================================
// INSTANCE STORAGE - Configuration State
// ===========================================================================

/// Validation configuration stored in instance storage.
#[soroban_sdk::contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidationConfig {
    /// Maximum deviation threshold in basis points (1 bp = 0.01%).
    pub deviation_threshold_bps: i128,
    /// Maximum allowed age of a price feed in seconds.
    pub max_staleness_secs: u64,
}

/// Sets the validation configuration in instance storage.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `config` - The configuration to store
pub fn set_config(env: &Env, config: &ValidationConfig) {
    env.storage().instance().set(&KEY_CONFIG, config);
    bump_instance_ttl(env);
}

/// Gets the validation configuration from instance storage.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Returns
/// The validation configuration
///
/// # Errors
/// - `OracleError::NotInitialized` if config is not set
pub fn get_config(env: &Env) -> Result<ValidationConfig, OracleError> {
    env.storage()
        .instance()
        .get(&KEY_CONFIG)
        .ok_or(OracleError::NotInitialized)
}

/// Sets the circuit breaker lock state in instance storage.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `is_locked` - Whether the circuit breaker is tripped
pub fn set_locked(env: &Env, is_locked: bool) {
    env.storage().instance().set(&KEY_IS_LOCKED, &is_locked);
    bump_instance_ttl(env);
}

/// Gets the circuit breaker lock state from instance storage.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Returns
/// true if the circuit breaker is tripped, false otherwise
pub fn is_locked(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&KEY_IS_LOCKED)
        .unwrap_or(false)
}

// ===========================================================================
// TEMPORARY STORAGE - Short-lived Price State
// ===========================================================================

/// Sets the last diagnostic value in temporary storage.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `value` - The diagnostic value (deviation in bps or error code)
pub fn set_last_diagnostic(env: &Env, value: i128) {
    env.storage().temporary().set(&KEY_LAST_DIAG, &value);
    bump_temp_ttl(env, &KEY_LAST_DIAG);
}

/// Gets the last diagnostic value from temporary storage.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Returns
/// The last diagnostic value, or None if not set
pub fn get_last_diagnostic(env: &Env) -> Option<i128> {
    env.storage().temporary().get(&KEY_LAST_DIAG)
}

/// Sets the last validated primary price in temporary storage.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `price` - The primary price
pub fn set_last_primary_price(env: &Env, price: i128) {
    env.storage().temporary().set(&KEY_LAST_PRIMARY_PRICE, &price);
    bump_temp_ttl(env, &KEY_LAST_PRIMARY_PRICE);
}

/// Gets the last validated primary price from temporary storage.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Returns
/// The last primary price, or None if not set
pub fn get_last_primary_price(env: &Env) -> Option<i128> {
    env.storage().temporary().get(&KEY_LAST_PRIMARY_PRICE)
}

/// Sets the last validated fallback price in temporary storage.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `price` - The fallback price
pub fn set_last_fallback_price(env: &Env, price: i128) {
    env.storage().temporary().set(&KEY_LAST_FALLBACK_PRICE, &price);
    bump_temp_ttl(env, &KEY_LAST_FALLBACK_PRICE);
}

/// Gets the last validated fallback price from temporary storage.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Returns
/// The last fallback price, or None if not set
pub fn get_last_fallback_price(env: &Env) -> Option<i128> {
    env.storage().temporary().get(&KEY_LAST_FALLBACK_PRICE)
}

/// Sets the timestamp of the last successful validation.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `timestamp` - The validation timestamp
pub fn set_last_validation_timestamp(env: &Env, timestamp: u64) {
    env.storage().temporary().set(&KEY_LAST_VALIDATION_TS, &timestamp);
    bump_temp_ttl(env, &KEY_LAST_VALIDATION_TS);
}

/// Gets the timestamp of the last successful validation.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Returns
/// The last validation timestamp, or None if not set
pub fn get_last_validation_timestamp(env: &Env) -> Option<u64> {
    env.storage().temporary().get(&KEY_LAST_VALIDATION_TS)
}

/// Clears all temporary storage entries.
///
/// # Arguments
/// - `env` - The Soroban environment
pub fn clear_temporary_storage(env: &Env) {
    env.storage().temporary().remove(&KEY_LAST_DIAG);
    env.storage().temporary().remove(&KEY_LAST_PRIMARY_PRICE);
    env.storage().temporary().remove(&KEY_LAST_FALLBACK_PRICE);
    env.storage().temporary().remove(&KEY_LAST_VALIDATION_TS);
}

// ===========================================================================
// TTL MANAGEMENT
// ===========================================================================

/// Bumps the TTL for instance storage.
///
/// This should be called on every contract execution to ensure
/// configuration state persists.
///
/// # Arguments
/// - `env` - The Soroban environment
pub fn bump_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_LEDGERS, TTL_EXTENSION_THRESHOLD);
}

/// Bumps the TTL for a specific temporary storage entry.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `key` - The storage key to bump
pub fn bump_temp_ttl(env: &Env, key: &Symbol) {
    env.storage()
        .temporary()
        .extend_ttl(key, TEMP_TTL_LEDGERS, TTL_EXTENSION_THRESHOLD);
}

/// Bumps TTL for all temporary storage entries.
///
/// # Arguments
/// - `env` - The Soroban environment
pub fn bump_all_temp_ttl(env: &Env) {
    bump_temp_ttl(env, &KEY_LAST_DIAG);
    bump_temp_ttl(env, &KEY_LAST_PRIMARY_PRICE);
    bump_temp_ttl(env, &KEY_LAST_FALLBACK_PRICE);
    bump_temp_ttl(env, &KEY_LAST_VALIDATION_TS);
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_config_storage() {
        let env = Env::default();
        let config = ValidationConfig {
            deviation_threshold_bps: 500,
            max_staleness_secs: 600,
        };

        set_config(&env, &config);
        let retrieved = get_config(&env).unwrap();
        assert_eq!(retrieved.deviation_threshold_bps, 500);
        assert_eq!(retrieved.max_staleness_secs, 600);
    }

    #[test]
    fn test_locked_storage() {
        let env = Env::default();

        set_locked(&env, true);
        assert!(is_locked(&env));

        set_locked(&env, false);
        assert!(!is_locked(&env));
    }

    #[test]
    fn test_diagnostic_storage() {
        let env = Env::default();

        set_last_diagnostic(&env, 100);
        assert_eq!(get_last_diagnostic(&env), Some(100));

        set_last_diagnostic(&env, 200);
        assert_eq!(get_last_diagnostic(&env), Some(200));
    }

    #[test]
    fn test_clear_temporary_storage() {
        let env = Env::default();

        set_last_diagnostic(&env, 100);
        set_last_primary_price(&env, 1_000_000);
        set_last_fallback_price(&env, 1_000_000);

        clear_temporary_storage(&env);

        assert_eq!(get_last_diagnostic(&env), None);
        assert_eq!(get_last_primary_price(&env), None);
        assert_eq!(get_last_fallback_price(&env), None);
    }
}
