import type { AtomRegistry } from "effect/reactivity";

// Free identifiers shared by the JSDoc examples, checked by `ensforge-dev examples`. They stand
// for values the reader's app already has.
import type { Ensforge } from "@ensforge/sdk";
import type { Address } from "viem";
import type { Config as WagmiConfig } from "wagmi";

declare global {
  const ens: Ensforge.Client;
  const registry: AtomRegistry.AtomRegistry;
  const wagmiConfig: WagmiConfig;
  const address: Address;
  const recipient: Address;
}
