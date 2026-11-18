import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { TokenInfo } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Reads the `.eth` registration settings: contracts, commitment window, minimum duration, grace
 * period and accepted payment tokens.
 *
 * **When to use**
 *
 * Use to build registration UIs: the commitment wait, the shortest duration, and which tokens
 * to offer.
 *
 * **Example** (Reading the settings)
 *
 * ```ts
 * const { minCommitmentAge, paymentTokens } = await ens.registration.getParameters()
 * ```
 *
 * **Example** (Reading with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const parameters = await Actions.registration.getParameters(publicClient)
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const parameters = yield* Actions.registration.getParameters(ens)
 * ```
 *
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without ENSv2.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.registration.register} to register
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getParameters(
  client: Like,
  options?: getParameters.Options,
): Promise<getParameters.ReturnType> {
  return Action.promise("registration.getParameters", Impl.getParameters, client, options ?? {});
}

export declare namespace getParameters {
  /** Options for {@link getParameters}. */
  type Options = Pick<Read.Options, "signal"> & Read.BlockOptions;
  /** Registration settings; durations and ages are in seconds. */
  type ReturnType = {
    readonly registrar: Address;
    readonly renewer: Address;
    readonly priceOracle: Address;
    readonly minCommitmentAge: bigint;
    readonly maxCommitmentAge: bigint;
    readonly minDuration: bigint;
    readonly gracePeriod: bigint;
    /** Tokens listed for the deployment that the price oracle currently accepts. */
    readonly paymentTokens: readonly TokenInfo[];
  };
  /** Errors {@link getParameters} can fail with. */
  type ErrorType = Errors.CommonError | Errors.UnsupportedError;
}

/** Builds a deferred read for `Actions.batch`. */
getParameters.request = Action.request(
  "registration.getParameters",
  Impl.getParameters as Action.Declared<typeof Impl.getParameters, getParameters.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getParameters.path = "registration.getParameters" as const;
