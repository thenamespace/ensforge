import type { Account, Address } from "viem";

import type { Client, ViemClient, ViemWalletClient } from "./types.js";

/** What a client keeps besides its public fields, shared by the clients `extend` and `chainClient` derive. */
export type State = {
  /** The read client of a chain, built on first use; `undefined` when the chain is unreachable. */
  readonly clientOf: (chainId: number) => ViemClient | undefined;
  /** A wallet that signs on `chainId` (switched, or built for a local account), or `undefined`. */
  readonly walletOn: (chainId: number) => Promise<ViemWalletClient | undefined>;
  /** The configured signer: a local account, an address, or `undefined` for the wallet's own. */
  readonly signer: Account | Address | undefined;
};

const states = new WeakMap<object, State>();

/** Attaches `state` to a client. */
export const setState = (client: Client<object>, state: State): void => {
  states.set(client, state);
};

/** The state of an ensforge client, or `undefined` for anything else. */
export const stateOf = (value: unknown): State | undefined =>
  typeof value === "object" && value !== null ? states.get(value) : undefined;
