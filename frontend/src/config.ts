// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Frontend Configuration
//
// Centralized config for the deployed Soroban contract on Stellar testnet.
// Update these values when redeploying or switching networks.
// ---------------------------------------------------------------------------

/** The deployed OmniCheck contract ID on Stellar testnet. */
export const CONTRACT_ID =
  "CB5HM7AHEDTQIEG6CBBGQZHWS63REXOHCAONZEMHS65QQ2XU7OY2APS5";

/** Soroban RPC endpoint for the Stellar testnet. */
export const RPC_URL = "https://soroban-testnet.stellar.org";

/** Stellar testnet network passphrase. */
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

/** Polling interval in milliseconds for contract state queries. */
export const CONTRACT_POLL_INTERVAL_MS = 30_000;

/** Link to the contract on the Stellar Expert block explorer. */
export const EXPLORER_URL =
  "https://stellar.expert/explorer/testnet/contract/CB5HM7AHEDTQIEG6CBBGQZHWS63REXOHCAONZEMHS65QQ2XU7OY2APS5";
