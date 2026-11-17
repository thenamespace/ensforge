import type { Errors } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";
import type { Address } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import type { HcaSession } from "../../../types.js";
import * as Impl from "./effect.js";

/**
 * Asks the owner to approve a session key for their HCA, with one signature and no transaction.
 *
 * **When to use**
 *
 * Use to enable prompt-free registration and record updates through Rhinestone (`hca({ session
 * })`).
 *
 * **Details**
 *
 * - The session may register names to the owner, deploy and edit `resolver` (one resolver per
 *   session), set the owner's primary name and approve registration payments.
 * - It stays valid until `validUntil` or until the owner calls `revokeSessions`. Store the
 *   returned session; it holds no secret.
 * - Refund ceilings default to the ENS app's: $20k per ETH, 500k gas of overhead, 100 USDC per
 *   intent.
 *
 * **Example** (Authorizing a session)
 *
 * ```ts
 * const session = await ens.hca.authorizeSession({ sessionKey: sessionAccount.address, resolver, validUntil })
 * ```
 *
 * **Example** (Authorizing a session with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.authorizeSession(ens, { sessionKey: sessionAccount.address, resolver, validUntil })
 * ```
 *
 * **Example** (Authorizing a session in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.authorizeSession(ens, { sessionKey: sessionAccount.address, resolver, validUntil })
 * ```
 *
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the owner declines.
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for invalid addresses.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function authorizeSession(
  client: Like,
  options: authorizeSession.Options,
): Promise<authorizeSession.ReturnType> {
  return Action.promise("hca.authorizeSession", Impl.authorizeSession, client, options);
}

export declare namespace authorizeSession {
  /** Options for {@link authorizeSession}. */
  type Options = {
    /** Public address of the session key the app keeps. */
    sessionKey: string;
    /** The one resolver the session may deploy and edit (an HCA-deployed PermissionedResolver). */
    resolver: string;
    /** Unix seconds after which the session stops working. */
    validUntil: number;
    /** Refund ceilings for Rhinestone executions, in the refund token's units. */
    refund?:
      | {
          readonly token?: Address | undefined;
          readonly maxExchangeRate?: bigint | undefined;
          readonly maxGasOverhead?: bigint | undefined;
          readonly maxAmount?: bigint | undefined;
        }
      | undefined;
    /** Signer (the HCA owner). @default the client's account */
    account?: Address | undefined;
  };
  /** The approved session, to store. */
  type ReturnType = HcaSession;
  /** Errors {@link authorizeSession} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
