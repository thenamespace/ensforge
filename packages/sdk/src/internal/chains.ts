import { Array as Arr } from "effect";

import { defineChain, type Chain } from "viem";

// Multicall3's address on every chain below.
const multicall3 = { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } as const;

const define = (
  id: number,
  name: string,
  rpc: string,
  currency: { readonly name: string; readonly symbol: string } = { name: "Ether", symbol: "ETH" },
): Chain =>
  defineChain({
    id,
    name,
    nativeCurrency: { ...currency, decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
    contracts: { multicall3 },
  });

/**
 * The chains L2 namespaces live on, with viem's public RPC for each, for reading names on a chain
 * the app gave no transport for. Only what reads and plain transactions need: viem's full
 * definitions add formatters (about 6 kB gzip for these chains), which reads do not use.
 */
const known: ReadonlyMap<number, Chain> = new Map(
  Arr.map(
    [
      define(8453, "Base", "https://mainnet.base.org"),
      define(84532, "Base Sepolia", "https://sepolia.base.org"),
      define(10, "OP Mainnet", "https://mainnet.optimism.io"),
      define(11155420, "OP Sepolia", "https://sepolia.optimism.io"),
      define(42161, "Arbitrum One", "https://arb1.arbitrum.io/rpc"),
      define(421614, "Arbitrum Sepolia", "https://sepolia-rollup.arbitrum.io/rpc"),
      define(59144, "Linea Mainnet", "https://rpc.linea.build"),
      define(59141, "Linea Sepolia Testnet", "https://rpc.sepolia.linea.build"),
      define(534352, "Scroll", "https://rpc.scroll.io"),
      // Scroll Sepolia (534351) is left out: it has no working public RPC. A transport for it
      // in `transports` still reaches it.
      define(137, "Polygon", "https://polygon.drpc.org", { name: "POL", symbol: "POL" }),
      define(80002, "Polygon Amoy", "https://polygon-amoy.drpc.org", {
        name: "POL",
        symbol: "POL",
      }),
      define(42220, "Celo", "https://forno.celo.org", { name: "CELO", symbol: "CELO" }),
      define(11142220, "Celo Sepolia Testnet", "https://forno.celo-sepolia.celo-testnet.org", {
        name: "CELO",
        symbol: "S-CELO",
      }),
      define(480, "World Chain", "https://worldchain-mainnet.g.alchemy.com/public"),
      define(4801, "World Chain Sepolia", "https://worldchain-sepolia.g.alchemy.com/public"),
    ],
    (chain) => [chain.id, chain] as const,
  ),
);

/** The definition of a chain ensforge knows, or `undefined`. */
export const knownChain = (chainId: number): Chain | undefined => known.get(chainId);
