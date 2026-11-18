import type { Account, Address } from "viem";

import type { Client, ViemClient, ViemWalletClient } from "./types.js";

/** Per-client values that are not part of the public shape. Shared by every extended copy. */
export type State = {
  readonly getWalletClient: () => Promise<ViemWalletClient | undefined>;
  /** The `account` option as given; a local `Account` must reach viem to sign. */
  readonly signer: Account | Address | undefined;
  /** Clients of the other chains from the `chains` option, by chain ID. */
  readonly chains: ReadonlyMap<number, ChainState>;
};

/** One chain of the `chains` option. */
export type ChainState = {
  readonly publicClient: ViemClient;
  readonly getWalletClient: () => Promise<ViemWalletClient | undefined>;
};

const states = new WeakMap<object, State>();

/** @internal */
export const setState = (client: Client<object>, state: State): void => {
  states.set(client, state);
};

/** Internal state of an ensforge client, or `undefined` for any other value. */
export const stateOf = (value: unknown): State | undefined =>
  typeof value === "object" && value !== null ? states.get(value) : undefined;
