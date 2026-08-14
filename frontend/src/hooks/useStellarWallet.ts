// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Stellar Wallet Integration Hook
//
// This hook provides Stellar wallet connection functionality using Freighter.
// It handles wallet connection, disconnection, and address retrieval for
// Stellar Mainnet, Testnet, and Futurenet.
//
// Uses the global window.freighter API which is injected by the Freighter
// browser extension.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";

// TypeScript declarations for the Freighter API
declare global {
  interface Window {
    freighter?: {
      isConnected: () => Promise<boolean>;
      getAddress: () => Promise<string>;
      signTransaction: (xdr: string, network: string) => Promise<string>;
    };
  }
}

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  network: "mainnet" | "testnet" | "futurenet";
  isConnecting: boolean;
  error: string | null;
}

export interface UseStellarWalletReturn {
  walletState: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: "mainnet" | "testnet" | "futurenet") => Promise<void>;
}

export function useStellarWallet(): UseStellarWalletReturn {
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    address: null,
    network: "testnet",
    isConnecting: false,
    error: null,
  });

  // Check if wallet is already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (!window.freighter) {
        setWalletState((prev: WalletState) => ({
          ...prev,
          error: "Freighter wallet not found. Please install the Freighter extension.",
        }));
        return;
      }

      try {
        const isAllowed = await window.freighter.isConnected();
        if (isAllowed) {
          const address = await window.freighter.getAddress();
          setWalletState((prev: WalletState) => ({
            ...prev,
            isConnected: true,
            address,
          }));
        }
      } catch (err) {
        console.error("Failed to check wallet connection:", err);
      }
    };

    checkConnection();
  }, []);

  const connect = useCallback(async () => {
    if (!window.freighter) {
      setWalletState((prev: WalletState) => ({
        ...prev,
        error: "Freighter wallet not found. Please install the Freighter extension.",
      }));
      return;
    }

    setWalletState((prev: WalletState) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const address = await window.freighter.getAddress();
      setWalletState((prev: WalletState) => ({
        ...prev,
        isConnected: true,
        address,
        isConnecting: false,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect wallet";
      setWalletState((prev: WalletState) => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setWalletState({
      isConnected: false,
      address: null,
      network: "testnet",
      isConnecting: false,
      error: null,
    });
  }, []);

  const switchNetwork = useCallback(async (network: "mainnet" | "testnet" | "futurenet") => {
    setWalletState((prev: WalletState) => ({ ...prev, network }));
    
    // In a real implementation, you would prompt the user to switch networks
    // in Freighter. For now, we just update the local state.
    // Freighter API doesn't have a direct network switch method,
    // so users need to switch manually in the extension.
  }, []);

  return {
    walletState,
    connect,
    disconnect,
    switchNetwork,
  };
}
