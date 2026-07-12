// ---------------------------------------------------------------------------
// Oracle Sanity Engine — On-Chain Contract Data Hook
//
// Provides a React Context and hook for querying the deployed Soroban
// contract on Stellar testnet. Polls read-only contract functions every
// CONTRACT_POLL_INTERVAL_MS and exposes the results to all components.
//
// Uses Contract.call() + TransactionBuilder + simulateTransaction for
// read-only Soroban contract function calls.
// ---------------------------------------------------------------------------

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  rpc,
  Contract,
  Account,
  TransactionBuilder,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  CONTRACT_ID,
  RPC_URL,
  NETWORK_PASSPHRASE,
  CONTRACT_POLL_INTERVAL_MS,
} from "../config";

// Dummy valid Stellar public key for simulation (does not need to be funded)
const DUMMY_ACCOUNT =
  "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNM5";

// ===========================================================================
// TYPES
// ===========================================================================

/** Validation config returned by the contract's get_config() function. */
export interface ContractConfig {
  deviation_threshold_bps: number;
  max_staleness_secs: number;
}

/** The shape of data exposed by the contract data context. */
export interface ContractData {
  isLocked: boolean | null;
  config: ContractConfig | null;
  lastDiagnostic: number | null;
  isLoaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// ===========================================================================
// CONTEXT
// ===========================================================================

const ContractDataContext = createContext<ContractData>({
  isLocked: null,
  config: null,
  lastDiagnostic: null,
  isLoaded: false,
  error: null,
  refresh: async () => {},
});

// ===========================================================================
// HELPERS
// ===========================================================================

/**
 * Unwraps a Soroban Result<T, E> from scValToNative.
 *
 * Soroban functions returning `Result<T, E>` are serialized as
 * `{ ok: T }` on success or `{ error: E }` on failure.
 * Non-Result types (bool, Option, etc.) pass through unchanged.
 */
function unwrapResult(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "ok" in raw) {
    return (raw as { ok: unknown }).ok;
  }
  if (raw && typeof raw === "object" && "error" in raw) {
    throw new Error(
      `Contract returned error code: ${(raw as { error: unknown }).error}`
    );
  }
  return raw;
}

/**
 * Calls a Soroban contract function via simulation.
 *
 * Builds a read-only transaction with a dummy account, simulates it,
 * and extracts the return value using scValToNative.
 */
async function simulateCall(
  server: rpc.Server,
  contractId: string,
  functionName: string
): Promise<unknown> {
  const contract = new Contract(contractId);
  const op = contract.call(functionName);

  const tx = new TransactionBuilder(new Account(DUMMY_ACCOUNT, "0"), {
    fee: "0",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op as xdr.Operation)
    .setTimeout(30)
    .build();

  const response = await server.simulateTransaction(tx);

  // Check for simulation errors
  if ("error" in response && response.error) {
    throw new Error(`Simulation failed for ${functionName}: ${response.error}`);
  }

  // Access result.retval (only present on success)
  const simResult = response as { result?: { retval: xdr.ScVal } };
  if (!simResult.result?.retval) {
    throw new Error(`No result from simulation for ${functionName}`);
  }

  return scValToNative(simResult.result.retval);
}

// ===========================================================================
// PROVIDER
// ===========================================================================

interface ContractDataProviderProps {
  children: ReactNode;
}

export function ContractDataProvider({ children }: ContractDataProviderProps) {
  const [isLocked, setIsLocked] = useState<boolean | null>(null);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [lastDiagnostic, setLastDiagnostic] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serverRef = useRef<rpc.Server | null>(null);

  const getServer = useCallback(() => {
    if (!serverRef.current) {
      serverRef.current = new rpc.Server(RPC_URL);
    }
    return serverRef.current;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const server = getServer();

      const [lockedRaw, configRaw, diagnosticRaw] = await Promise.all([
        simulateCall(server, CONTRACT_ID, "is_locked"),
        simulateCall(server, CONTRACT_ID, "get_config"),
        simulateCall(server, CONTRACT_ID, "get_last_diagnostic"),
      ]);

      // is_locked returns bool directly
      setIsLocked(lockedRaw as boolean);

      // get_config returns Result<ValidationConfig, OracleError>
      const unwrappedConfig = unwrapResult(configRaw) as ContractConfig;
      setConfig(unwrappedConfig);

      // get_last_diagnostic returns Option<i128> -> number | null
      setLastDiagnostic(diagnosticRaw as number | null);

      setError(null);
      setIsLoaded(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to query contract";
      console.error("[useContractData]", msg);
      setError(msg);
      setIsLoaded(true);
    }
  }, [getServer]);

  useEffect(() => {
    let isMounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    refresh().then(() => {
      if (isMounted) {
        interval = setInterval(refresh, CONTRACT_POLL_INTERVAL_MS);
      }
    });

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [refresh]);

  const value: ContractData = {
    isLocked,
    config,
    lastDiagnostic,
    isLoaded,
    error,
    refresh,
  };

  return (
    <ContractDataContext.Provider value={value}>
      {children}
    </ContractDataContext.Provider>
  );
}

// ===========================================================================
// HOOK
// ===========================================================================

export function useContractData(): ContractData {
  return useContext(ContractDataContext);
}
