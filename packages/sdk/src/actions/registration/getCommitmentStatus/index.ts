import type { Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads where a registration commitment is in its window.
 *
 * **When to use**
 *
 * Use to show a countdown between `registration.commit` and `registration.register`.
 *
 * **Details**
 *
 * - `pending`: too new to register; `ready`: register now; `expired`: commit again.
 * - `unknown`: never made, or already used by a registration.
 *
 * **Example** (Waiting for a commitment)
 *
 * ```ts
 * const { status, readyAt } = await ens.registration.getCommitmentStatus({ commitment })
 * ```
 *
 * **Example** (Reading with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const status = await Actions.registration.getCommitmentStatus(publicClient, { commitment })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const status = yield* Actions.registration.getCommitmentStatus(ens, { commitment })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_RECORD_VALUE`) when the commitment is not 32 bytes.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without ENSv2.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.registration.commit} to make one
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getCommitmentStatus(
  client: Like,
  options: getCommitmentStatus.Options,
): Promise<getCommitmentStatus.ReturnType> {
  return Action.promise(
    "registration.getCommitmentStatus",
    Impl.getCommitmentStatus,
    client,
    options,
  );
}

export declare namespace getCommitmentStatus {
  /** Options for {@link getCommitmentStatus}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** Commitment hash returned by `registration.commit`. */
      commitment: Hex;
    };
  /** The status and the window's timestamps (`null` when unknown). */
  type ReturnType = {
    readonly status: "pending" | "ready" | "expired" | "unknown";
    readonly committedAt: bigint | null;
    readonly readyAt: bigint | null;
    readonly expiresAt: bigint | null;
  };
  /** Errors {@link getCommitmentStatus} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getCommitmentStatus.request = Action.request(
  "registration.getCommitmentStatus",
  Impl.getCommitmentStatus,
);

/** Path of the action, e.g. for cache keys. */
getCommitmentStatus.path = "registration.getCommitmentStatus" as const;
