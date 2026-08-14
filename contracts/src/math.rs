// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Math & Precision Normalization (Soroban-native)
//
// This module provides standardized precision handling for Stellar/Soroban:
// - STROOP precision: 10^7 (matches Stellar Classic native asset units)
// - Derivative precision: 10^14 (for derivative asset comparisons)
//
// All price valuations should be normalized using these constants to ensure
// consistency across different oracle feeds and prevent precision-related bugs.
// ---------------------------------------------------------------------------

/// Stellar STROOP precision (10^7).
/// This matches the native precision of Stellar Classic assets (XLM, custom assets).
/// Example: $20.00 = 200_000_000 (20 * 10^7)
pub const STROOP_PRECISION: i128 = 10_000_000;

/// Derivative asset precision (10^14).
/// Used for derivative asset comparisons where higher precision is needed.
/// Example: $20.00 = 2_000_000_000_000_000 (20 * 10^14)
pub const DERIVATIVE_PRECISION: i128 = 100_000_000_000_000;

/// Normalizes a price to STROOP precision (10^7).
///
/// # Arguments
/// - `price` - The raw price value
/// - `current_precision` - The current precision of the price
///
/// # Returns
/// The price normalized to STROOP precision
pub fn normalize_to_stroop(price: i128, current_precision: i128) -> i128 {
    if current_precision == STROOP_PRECISION {
        return price;
    }
    if current_precision > STROOP_PRECISION {
        price / (current_precision / STROOP_PRECISION)
    } else {
        price * (STROOP_PRECISION / current_precision)
    }
}

/// Normalizes a price to derivative precision (10^14).
///
/// # Arguments
/// - `price` - The raw price value
/// - `current_precision` - The current precision of the price
///
/// # Returns
/// The price normalized to derivative precision
pub fn normalize_to_derivative(price: i128, current_precision: i128) -> i128 {
    if current_precision == DERIVATIVE_PRECISION {
        return price;
    }
    if current_precision > DERIVATIVE_PRECISION {
        price / (current_precision / DERIVATIVE_PRECISION)
    } else {
        price * (DERIVATIVE_PRECISION / current_precision)
    }
}

/// Computes deviation in basis points between two prices.
///
/// deviation_bps = (|price_a - price_b| * 10_000) / price_a
///
/// # Arguments
/// - `price_a` - First price (typically the primary oracle price)
/// - `price_b` - Second price (typically the fallback oracle price)
///
/// # Returns
/// Deviation in basis points (1 bp = 0.01%)
pub fn compute_deviation_bps(price_a: i128, price_b: i128) -> i128 {
    if price_a <= 0 {
        return i128::MAX;
    }

    let diff = if price_a >= price_b {
        price_a.saturating_sub(price_b)
    } else {
        price_b.saturating_sub(price_a)
    };

    diff.checked_mul(10_000)
        .and_then(|scaled| scaled.checked_div(price_a))
        .unwrap_or(i128::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stroop_precision_constant() {
        assert_eq!(STROOP_PRECISION, 10_000_000);
    }

    #[test]
    fn test_derivative_precision_constant() {
        assert_eq!(DERIVATIVE_PRECISION, 100_000_000_000_000);
    }

    #[test]
    fn test_normalize_to_stroop_same_precision() {
        let price = 200_000_000;
        assert_eq!(normalize_to_stroop(price, STROOP_PRECISION), price);
    }

    #[test]
    fn test_normalize_to_stroop_from_derivative() {
        // $20.00 in derivative precision = 2_000_000_000_000_000
        // Should normalize to 200_000_000 in STROOP
        let price = 2_000_000_000_000_000;
        let normalized = normalize_to_stroop(price, DERIVATIVE_PRECISION);
        assert_eq!(normalized, 200_000_000);
    }

    #[test]
    fn test_compute_deviation_bps_identical() {
        let deviation = compute_deviation_bps(1_000_000_000, 1_000_000_000);
        assert_eq!(deviation, 0);
    }

    #[test]
    fn test_compute_deviation_bps_one_percent() {
        // 1% deviation = 100 bps
        let deviation = compute_deviation_bps(1_000_000_000, 990_000_000);
        assert_eq!(deviation, 100);
    }

    #[test]
    fn test_compute_deviation_bps_five_percent() {
        // 5% deviation = 500 bps
        let deviation = compute_deviation_bps(1_000_000_000, 950_000_000);
        assert_eq!(deviation, 500);
    }

    #[test]
    fn test_compute_deviation_bps_zero_price() {
        let deviation = compute_deviation_bps(0, 1_000_000_000);
        assert_eq!(deviation, i128::MAX);
    }
}
