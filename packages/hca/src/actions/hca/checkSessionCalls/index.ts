import type { Errors } from "@ensforge/core";
import type { Plan } from "@ensforge/core";
import { Action, type Like } from "@ensforge/core/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import type { HcaSession } from "../../../types.js";
import * as Impl from "./effect.js";

/**
 * Checks calls against the HCA session policy before anything is signed.
 *
 * **When to use**
 *
 * Use to tell users up front which actions a session can do without prompts; `hca({ session })`
 * runs this check itself.
 *
 * **Details**
 *
 * - Allowed: commit and register (to the owner, with the session resolver), the session
 *   resolver's deployment and record setters, the owner's primary name, and payment approvals to
 *   the registrar.
 * - Not allowed: renewals, transfers, subnames, registry approvals and other contracts.
 *
 * **Example** (Checking a record update)
 *
 * ```ts
 * await ens.hca.checkSessionCalls({ session, calls })
 * ```
 *
 * **Example** (Checking a record update with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.checkSessionCalls(ens, { session, calls })
 * ```
 *
 * **Example** (Checking a record update in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.checkSessionCalls(ens, { session, calls })
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_ACTION_NOT_ALLOWED`) for the first call outside the policy.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function checkSessionCalls(
  client: Like,
  options: checkSessionCalls.Options,
): Promise<checkSessionCalls.ReturnType> {
  return Action.promise("hca.checkSessionCalls", Impl.checkSessionCalls, client, options);
}

export declare namespace checkSessionCalls {
  /** Options for {@link checkSessionCalls}. */
  type Options = {
    /** The session from `authorizeSession`. */
    session: HcaSession;
    /** Calls the HCA would run. */
    calls: readonly Plan.Call[];
  };
  /** `true` when every call is allowed. */
  type ReturnType = true;
  /** Errors {@link checkSessionCalls} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
