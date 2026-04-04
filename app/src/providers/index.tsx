"use client";

import { PropsWithChildren, useEffect } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  initiaPrivyWalletConnector,
  injectStyles,
  InterwovenKitProvider,
  TESTNET,
} from "@initia/interwovenkit-react";
import interwovenKitStyles from "@initia/interwovenkit-react/styles.js";
import { nativ, CHAIN_ID } from "@/lib/chain";

const wagmiConfig = createConfig({
  connectors: [initiaPrivyWalletConnector],
  chains: [nativ],
  transports: { [nativ.id]: http() },
});

const queryClient = new QueryClient();

const customChain = {
  chain_id: CHAIN_ID,
  chain_name: "nativ",
  pretty_name: "nativ",
  network_type: "testnet",
  bech32_prefix: "init",
  fees: { fee_tokens: [{ denom: "unativ" }] },
  apis: {
    rpc: [{ address: "https://nativ-rpc.s0nderlabs.xyz" }],
    rest: [{ address: "https://nativ-rpc.s0nderlabs.xyz" }],
    indexer: [{ address: "https://nativ-rpc.s0nderlabs.xyz" }],
    "json-rpc": [{ address: "https://nativ-rpc.s0nderlabs.xyz" }],
  },
  metadata: {
    minitia: { type: "minievm" },
  },
};

export function Providers({ children }: PropsWithChildren) {
  useEffect(() => {
    injectStyles(interwovenKitStyles);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <InterwovenKitProvider
          {...TESTNET}
          defaultChainId={CHAIN_ID}
          customChain={customChain as any}
          enableAutoSign={{
            [CHAIN_ID]: ["/minievm.evm.v1.MsgCall"],
          }}
        >
          {children}
        </InterwovenKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
