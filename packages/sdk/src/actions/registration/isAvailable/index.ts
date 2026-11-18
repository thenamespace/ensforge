import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Checks whether a `.eth` name can be registered now.
 *
 * **When to use**
 *
 * Use to show whether a name is free before quoting a price or starting a registration.
 *
 * **Details**
 *
 * - Every new `.eth` name is registered on ENSv2, including names that expired on ENSv1, so one
 *   check covers both.
 * - Names in their grace period are not available; only their owner can renew them.
 * - Labels the price oracle rejects (for example shorter than 3 characters) are not available.
 *
 * **Example** (Checking a name)
 *
 * ```ts
 * const free = await ens.registration.isAvailable({ name: "alice.eth" })
 * ```
 *
 * **Example** (Checking with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const free = await Actions.registration.isAvailable(publicClient, { name: "alice.eth" })
 * ```
 *
 * **Example** (Checking in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const free = yield* Actions.registration.isAvailable(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for names that are not `.eth` second-level names.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without ENSv2.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
 *
 * @see {@link Actions.registration.getPrice} to quote it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function isAvailable(
  client: Like,
  options: isAvailable.Options,
): Promise<isAvailable.ReturnType> {
  return Action.promise("registration.isAvailable", Impl.isAvailable, client, options);
}

export declare namespace isAvailable {
  /** Options for {@link isAvailable}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** `.eth` second-level name, e.g. `alice.eth`. Normalized automatically. */
      name: string;
    };
  /** Whether the name can be registered. */
  type ReturnType = boolean;
  /** Errors {@link isAvailable} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.UnsupportedError;
}

/** Builds a deferred read for `Actions.batch`. */
isAvailable.request = Action.request(
  "registration.isAvailable",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.isAvailable as Action.Declared<typeof Impl.isAvailable, isAvailable.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
isAvailable.path = "registration.isAvailable" as const;
