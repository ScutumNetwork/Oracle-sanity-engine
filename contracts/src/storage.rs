// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Storage Abstraction Layer
//
// This module provides a trait-based storage abstraction that models the
// two storage domains required by the system:
//
//   Instance Storage  — Persistent, global administration configuration.
//                       Data written here survives across contract calls.
//                       Used for: ValidationConfig, admin address, lock state.
//
//   Temporary Storage — Volatile scratch space for intermediate computations.
//                       Data written here is ephemeral and should not bloat
//                       long-term network state. Used for: intermediate
//                       deviation calculations, event payload construction.
//
// In a real WASM deployment (e.g., NEAR SDK, ink!, CosmWasm), these traits
// would be backed by the host chain's key-value storage and transient memory
// APIs. Community contributors can implement these traits for their target
// chain by providing the appropriate host-function bindings.
//
// # Example: NEAR SDK Implementation
//
// ```ignore
// impl InstanceStorage for NearStorage {
//     fn read_instance(key: &[u8]) -> Option<Vec<u8>> {
//         env::storage_read(key)
//     }
//     fn write_instance(key: &[u8], value: &[u8]) {
//         env::storage_write(key, value);
//     }
// }
// ```
// ---------------------------------------------------------------------------

use alloc::vec::Vec;

// ===========================================================================
// STORAGE TRAITS
// ===========================================================================

/// Persistent storage for global contract configuration.
///
/// **Instance storage** is designed for long-lived data that must survive
/// across contract invocations. The implementation should use the host
/// chain's persistent key-value store (e.g., NEAR `env::storage_write`,
/// ink! `self.env().set_contract_storage`, CosmWasm `deps.storage.set`).
///
/// # Lifetime
/// Data persists until explicitly removed or the contract is upgraded.
///
/// # Gas Considerations
/// Reading from instance storage incurs I/O cost proportional to value size.
/// Writing also incurs storage-rent cost on chains that charge for state.
pub trait InstanceStorage {
    /// Reads a value from instance storage.
    ///
    /// Returns `None` if the key does not exist.
    fn read_instance(key: &[u8]) -> Option<Vec<u8>>;

    /// Writes a value to instance storage.
    ///
    /// Overwrites any existing value at the same key.
    fn write_instance(key: &[u8], value: &[u8]);

    /// Removes a key from instance storage.
    ///
    /// On chains with storage rent, this refunds the storage deposit.
    fn remove_instance(key: &[u8]);
}

/// Ephemeral storage for transient computation data.
///
/// **Temporary storage** is designed for data that is needed only during
/// the current contract execution. Implementations should use in-memory
/// structures (e.g., `RefCell<HashMap>`) or the host chain's transient
/// storage APIs if available.
///
/// # Lifetime
/// Data is discarded when the contract execution completes. This prevents
/// long-term network state bloat from intermediate computations.
///
/// # Gas Considerations
/// Temporary storage should be cheap — it's typically backed by RAM
/// and does not incur persistent storage costs.
pub trait TemporaryStorage {
    /// Reads a value from temporary storage.
    ///
    /// Returns `None` if the key does not exist.
    fn read_temporary(key: &[u8]) -> Option<Vec<u8>>;

    /// Writes a value to temporary storage.
    fn write_temporary(key: &[u8], value: &[u8]);

    /// Clears all temporary storage.
    ///
    /// Called at the end of execution as a best practice.
    fn clear_temporary();
}

// ===========================================================================
// DEFAULT (IN-MEMORY) IMPLEMENTATION FOR TESTING
// ===========================================================================

#[cfg(test)]
pub mod testing {
    use super::*;
    use alloc::collections::BTreeMap;
    use core::cell::RefCell;

/// An in-memory implementation of both storage traits for unit testing.
///
/// Uses `BTreeMap` for deterministic ordering and `RefCell` for
/// interior mutability (the trait methods take `&self`, not `&mut self`).
///
/// Instance and Temporary storage are kept in separate maps so tests
/// can verify that transient data never leaks into persistent state.
pub struct MemoryStorage {
    pub instance: RefCell<BTreeMap<Vec<u8>, Vec<u8>>>,
    pub temporary: RefCell<BTreeMap<Vec<u8>, Vec<u8>>>,
}

impl MemoryStorage {
    pub fn new() -> Self {
        Self {
            instance: RefCell::new(BTreeMap::new()),
            temporary: RefCell::new(BTreeMap::new()),
        }
    }
}

impl InstanceStorage for MemoryStorage {
    fn read_instance(key: &[u8]) -> Option<Vec<u8>> {
        self.instance.borrow().get(key).cloned()
    }

    fn write_instance(key: &[u8], value: &[u8]) {
        self.instance.borrow_mut().insert(key.to_vec(), value.to_vec());
    }

    fn remove_instance(key: &[u8]) {
        self.instance.borrow_mut().remove(key);
    }
}

impl TemporaryStorage for MemoryStorage {
    fn read_temporary(key: &[u8]) -> Option<Vec<u8>> {
        self.temporary.borrow().get(key).cloned()
    }

    fn write_temporary(key: &[u8], value: &[u8]) {
        self.temporary.borrow_mut().insert(key.to_vec(), value.to_vec());
    }

    fn clear_temporary() {
        // Called at end of execution — for the in-memory impl,
        // the RefCell is dropped when the struct is dropped.
    }
}
}

// ===========================================================================
// STORAGE KEY CONVENTIONS
// ===========================================================================

/// Well-known instance storage keys used by the OmniCheck engine.
///
/// Using a namespace prefix (e.g., `cfg:`) prevents key collisions
/// with other modules or future contract upgrades.
pub mod keys {
    /// Instance storage key for the `ValidationConfig` serialized as JSON.
    pub const CONFIG: &[u8] = b"cfg:validation_config";

    /// Instance storage key for the admin address.
    pub const ADMIN: &[u8] = b"cfg:admin";

    /// Temporary storage key for the last computed deviation (for event emission).
    pub const LAST_DEVIATION: &[u8] = b"tmp:last_deviation";

    /// Temporary storage key for the last diagnostic message.
    pub const LAST_DIAGNOSTIC: &[u8] = b"tmp:last_diagnostic";
}

// ===========================================================================
// TESTS
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::{testing::MemoryStorage, *};

    #[test]
    fn test_instance_storage_read_write() {
        let storage = MemoryStorage::new();

        // Write
        storage.write_instance(b"test_key", b"hello_world");

        // Read
        let value = storage.read_instance(b"test_key");
        assert_eq!(value, Some(b"hello_world".to_vec()));
    }

    #[test]
    fn test_instance_storage_missing_key() {
        let storage = MemoryStorage::new();
        assert_eq!(storage.read_instance(b"nonexistent"), None);
    }

    #[test]
    fn test_instance_storage_remove() {
        let storage = MemoryStorage::new();
        storage.write_instance(b"delete_me", b"value");
        assert!(storage.read_instance(b"delete_me").is_some());

        storage.remove_instance(b"delete_me");
        assert_eq!(storage.read_instance(b"delete_me"), None);
    }

    #[test]
    fn test_instance_storage_overwrite() {
        let storage = MemoryStorage::new();
        storage.write_instance(b"key", b"first");
        storage.write_instance(b"key", b"second");
        assert_eq!(
            storage.read_instance(b"key"),
            Some(b"second".to_vec())
        );
    }

    #[test]
    fn test_temporary_storage_separate_from_instance() {
        let storage = MemoryStorage::new();

        // Write to temporary, verify it's not in instance
        storage.write_temporary(b"tmp_key", b"ephemeral");
        assert_eq!(
            storage.read_temporary(b"tmp_key"),
            Some(b"ephemeral".to_vec())
        );
        assert_eq!(storage.read_instance(b"tmp_key"), None);

        // Write to instance, verify it's not in temporary
        storage.write_instance(b"perm_key", b"persistent");
        assert_eq!(
            storage.read_instance(b"perm_key"),
            Some(b"persistent".to_vec())
        );
        assert_eq!(storage.read_temporary(b"perm_key"), None);
    }

    #[test]
    fn test_temporary_storage_missing_key() {
        let storage = MemoryStorage::new();
        assert_eq!(storage.read_temporary(b"nope"), None);
    }
}
