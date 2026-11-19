import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads the address approved to transfer one ENSv1 name token (`getApproved`).
 *
 * **When to use**
 *
 * Use to check a pending single-name approval, e.g. before listing a name for sale.
 *
 * **Details**
 *
 * - Wrapped names use the NameWrapper token; unwrapped `.eth` names the BaseRegistrar token.
 * - ENSv2 names have no single-token approval; use operators.
 *
 * **Example** (Reading a name's approval)
 *
 * ```ts
 * const approved = await ens.approval.getToken({ name: "alice.eth" })
 * ```
 *
 * **Example** (Reading with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const approved = await Actions.approval.getToken(publicClient, { name: "vitalik.eth" })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const approved = yield* Actions.approval.getToken(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names and unwrapped subnames.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
 *
 * @see {@link Actions.approval.setToken} to change it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getToken(client: Like, options: getToken.Options): Promise<getToken.ReturnType> {
  return Action.promise("approval.getToken", Impl.getToken, client, options);
}

export declare namespace getToken {
  /** Options for {@link getToken}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name. Normalized automatically. */
      name: string;
    };
  /** The approved address, or `null`. */
  type ReturnType = Address | null;
  /** Errors {@link getToken} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.UnsupportedError;
}

/** Builds a deferred read for `Actions.batch`. */
getToken.request = Action.request(
  "approval.getToken",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getToken as Action.Declared<typeof Impl.getToken, getToken.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getToken.path = "approval.getToken" as const;
