/**
 * Building blocks for packages that add action groups to the ensforge client, such as
 * `@ensforge/hca`. Its own exports are `@stability unstable`: names and shapes can change in a
 * minor release. The client and error types it re-exports keep their own stability.
 *
 * @packageDocumentation
 */
export type { Bound, BoundWrite } from "./actions/bound.js";
export { from } from "./client/from.js";
export type {
  Client,
  ClientBase,
  Like,
  ViemClient,
  ViemClientLike,
  ViemWalletClient,
} from "./client/types.js";
export type { AnyError } from "./errors/types.js";
export { withDefaults } from "./errors/EnsforgeError.js";
export { registerMessages } from "./errors/describe/registry.js";
export { fromCause } from "./errors/translate/fromCause.js";

/**
 * Builds actions that run on both the Promise and the Effect API.
 *
 * @stability unstable
 */
export * as Action from "./internal/action/index.js";

export { requireAddress } from "./internal/name/write.js";

/**
 * RPC building blocks shared by the sdk's actions.
 *
 * @stability unstable
 */
export * as Rpc from "./internal/rpc/index.js";

export { receiptsOf, waitForReceipts } from "./internal/write/receipts.js";
export { addressOf } from "./internal/address.js";
export { resolveSigner, type Signer } from "./internal/write/signer.js";
export { simulatePlan, simulateStep } from "./internal/write/simulate.js";
export { make as makePlan } from "./plan/make.js";
