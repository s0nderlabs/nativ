import { defineChain } from "viem";

export const nativ = defineChain({
  id: 387030727203265,
  name: "nativ",
  nativeCurrency: { name: "NATIV", symbol: "NATIV", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["http://localhost:8545"],
      webSocket: ["ws://localhost:8546"],
    },
  },
});

export const CHAIN_ID = "nativ-1"; // Cosmos chain ID for InterwovenKit
