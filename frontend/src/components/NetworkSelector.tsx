// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Network Selector Component
//
// This component provides a UI for switching between Stellar networks:
// - Mainnet: Production Stellar network
// - Testnet: Stellar test network for development
// - Futurenet: Future test network for Soroban testing
//
// The selector dynamically updates RPC endpoints and contract IDs based on
// the selected network.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@radix-ui/react-select";
import { Globe } from "lucide-react";
import { useStellarWallet } from "../hooks/useStellarWallet";

export type StellarNetwork = "mainnet" | "testnet" | "futurenet";

export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  networkPassphrase: string;
  defaultContractId: string;
}

export const NETWORK_CONFIGS: Record<StellarNetwork, NetworkConfig> = {
  mainnet: {
    name: "Mainnet",
    rpcUrl: "https://rpc.mainnet.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    defaultContractId: "",
  },
  testnet: {
    name: "Testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    defaultContractId: "CB5HM7AHEDTQIEG6CBBGQZHWS63REXOHCAONZEMHS65QQ2XU7OY2APS5",
  },
  futurenet: {
    name: "Futurenet",
    rpcUrl: "https://rpc-futurenet.stellar.org",
    networkPassphrase: "Test SDF Future Network ; October 2022",
    defaultContractId: "",
  },
};

interface NetworkSelectorProps {
  selectedNetwork: StellarNetwork;
  onNetworkChange: (network: StellarNetwork) => void;
}

export function NetworkSelector({ selectedNetwork, onNetworkChange }: NetworkSelectorProps) {
  const { switchNetwork } = useStellarWallet();
  const [isOpen, setIsOpen] = useState(false);

  const handleNetworkChange = (network: StellarNetwork) => {
    onNetworkChange(network);
    switchNetwork(network);
    setIsOpen(false);
  };

  const currentConfig = NETWORK_CONFIGS[selectedNetwork];

  return (
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 text-slate-400" />
      <Select open={isOpen} onOpenChange={setIsOpen} value={selectedNetwork} onValueChange={handleNetworkChange}>
        <SelectTrigger
          className="w-[140px] bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <SelectValue placeholder="Select network" />
        </SelectTrigger>
        <SelectContent className="bg-surface border border-white/10 rounded-lg shadow-xl">
          {(Object.keys(NETWORK_CONFIGS) as StellarNetwork[]).map((network) => (
            <SelectItem
              key={network}
              value={network}
              className="text-sm text-slate-200 hover:bg-white/10 focus:bg-white/10 cursor-pointer"
            >
              {NETWORK_CONFIGS[network].name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
