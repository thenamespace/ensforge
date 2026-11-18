import type { Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Recovers a label from its labelhash through the ENSv2 LabelStore.
 *
 * **When to use**
 *
 * Use to display names that arrive as hashes, such as `[af2c…].eth` from events or indexers.
 *
 * **Details**
 *
 * - ENSv2 registries store every label they register, so this covers every ENSv2 name.
 * - Returns `null` when the LabelStore has never seen the label.
 *
 * **Example** (Recovering a label)
 *
 * ```ts
 * const label = await ens.name.getLabel({ labelhash: "0x5d5727cb0fb76e4944eafb88ec9a3cf0b3c9025a4b2f947729137c5d7f84f68f" })
 * ```
 *
 * **Example** (Recovering with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const label = await Actions.name.getLabel(publicClient, { labelhash })
 * ```
 *
 * **Example** (Recovering in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const label = yield* Actions.name.getLabel(ens, { labelhash })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_RECORD_VALUE`) when `labelhash` is not 32 bytes.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without an ENSv2 deployment.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getLabel(client: Like, options: getLabel.Options): Promise<getLabel.ReturnType> {
  return Action.promise("name.getLabel", Impl.getLabel, client, options);
}

export declare namespace getLabel {
  /** Options for {@link getLabel}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** Keccak-256 hash of the label, as from `Name.labelhash`. */
      labelhash: Hex;
    };
  /** The label, or `null` when unknown. */
  type ReturnType = string | null;
  /** Errors {@link getLabel} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.UnsupportedError;
}

/** Builds a deferred read for `Actions.batch`. */
getLabel.request = Action.request(
  "name.getLabel",
  Impl.getLabel as Action.Declared<typeof Impl.getLabel, getLabel.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getLabel.path = "name.getLabel" as const;
