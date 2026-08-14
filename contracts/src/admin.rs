// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Admin & Access Control (Soroban-native)
//
// This module handles administrative operations using Soroban native auth.
// All admin operations require Address::require_auth() to ensure the caller
// has signed the transaction with their Stellar account.
//
// Multi-sig governance is supported through Stellar's native multi-signature
// account system. The admin address can be a multi-sig account requiring
// multiple signatures for authorization.
// ---------------------------------------------------------------------------

use soroban_sdk::{Address, Env};

use crate::error::OracleError;

/// Storage key for the admin address in instance storage.
const KEY_ADMIN: soroban_sdk::Symbol = soroban_sdk::symbol_short!("admin");

/// Storage key for the proposed new admin (for multi-step admin transfer).
const KEY_PENDING_ADMIN: soroban_sdk::Symbol = soroban_sdk::symbol_short!("pend_adm");

/// Sets the admin address during contract initialization.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `admin` - The admin address to set
///
/// # Note
/// This function should only be called during initialization. The admin
/// address can be a multi-sig Stellar account for governance.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&KEY_ADMIN, admin);
}

/// Requires the caller to be the admin and authenticates the transaction.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Returns
/// The admin address if the caller is authorized
///
/// # Errors
/// - `OracleError::Unauthorized` if the caller is not the admin
///
/// # Note
/// Uses Soroban native auth (`Address::require_auth()`) to ensure the
/// caller has signed the transaction. For multi-sig accounts, all required
/// signers must have signed.
pub fn require_admin_auth(env: &Env) ->Result<Address, OracleError> {
    let admin = get_admin(env)?;
    admin.require_auth();
    Ok(admin)
}

/// Gets the current admin address from instance storage.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Returns
/// The admin address
///
/// # Errors
/// - `OracleError::NotInitialized` if admin is not set
pub fn get_admin(env: &Env) -> Result<Address, OracleError> {
    env.storage()
        .instance()
        .get(&KEY_ADMIN)
        .ok_or(OracleError::NotInitialized)
}

/// Initiates an admin transfer by setting a pending admin.
///
/// The new admin must call `accept_admin_transfer` to complete the transfer.
/// This two-step process prevents accidental admin lockout.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `new_admin` - The address of the proposed new admin
///
/// # Errors
/// - `OracleError::Unauthorized` if caller is not current admin
pub fn propose_admin_transfer(env: &Env, new_admin: &Address) -> Result<(), OracleError> {
    let admin = require_admin_auth(env)?;
    admin.require_auth();
    
    env.storage().instance().set(&KEY_PENDING_ADMIN, new_admin);
    Ok(())
}

/// Completes an admin transfer by accepting the pending admin role.
///
/// # Arguments
/// - `env` - The Soroban environment
///
/// # Errors
/// - `OracleError::Unauthorized` if caller is not the pending admin
/// - `OracleError::InvalidConfig` if no pending admin is set
pub fn accept_admin_transfer(env: &Env) -> Result<(), OracleError> {
    let pending_admin = env.storage()
        .instance()
        .get(&KEY_PENDING_ADMIN)
        .ok_or(OracleError::InvalidConfig)?;
    
    pending_admin.require_auth();
    
    // Set the new admin
    env.storage().instance().set(&KEY_ADMIN, &pending_admin);
    
    // Clear the pending admin
    env.storage().instance().remove(&KEY_PENDING_ADMIN);
    
    Ok(())
}

/// Checks if an address is the admin.
///
/// # Arguments
/// - `env` - The Soroban environment
/// - `address` - The address to check
///
/// # Returns
/// true if the address is the admin, false otherwise
pub fn is_admin(env: &Env, address: &Address) -> bool {
    if let Ok(admin) = get_admin(env) {
        admin == *address
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Address, Env};

    #[test]
    fn test_set_and_get_admin() {
        let env = Env::default();
        let admin = Address::generate(&env);
        
        set_admin(&env, &admin);
        assert_eq!(get_admin(&env).unwrap(), admin);
    }

    #[test]
    fn test_is_admin() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let other = Address::generate(&env);
        
        set_admin(&env, &admin);
        assert!(is_admin(&env, &admin));
        assert!(!is_admin(&env, &other));
    }

    #[test]
    fn test_get_admin_not_initialized() {
        let env = Env::default();
        assert!(matches!(get_admin(&env), Err(OracleError::NotInitialized)));
    }
}
