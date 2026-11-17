import type { Errors } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import type { HcaSession } from "../../../types.js";
import * as Impl from "./effect.js";

/**
 * Checks whether a stored HCA session can still be used.
 *
 * **When to use**
 *
 * Use when restoring a session the app stored, before offering prompt-free actions with it.
 *
 * **Details**
 *
 * - A session stops working when it expires, when the owner calls `revokeSessions`, or when the
 *   deployment's session signing domain changes.
 *
 * **Example** (Checking a stored session)
 *
 * ```ts
 * const { valid } = await ens.hca.getSession({ session })
 * ```
 *
 * **Example** (Checking a stored session with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.getSession(ens, { session })
 * ```
 *
 * **Example** (Checking a stored session in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.getSession(ens, { session })
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function getSession(
  client: Like,
  options: getSession.Options,
): Promise<getSession.ReturnType> {
  return Action.promise("hca.getSession", Impl.getSession, client, options);
}

export declare namespace getSession {
  /** Options for {@link getSession}. */
  type Options = {
    /** The session from `authorizeSession`. */
    session: HcaSession;
  };
  /** Whether the session works, and why not. */
  type ReturnType = {
    readonly valid: boolean;
    readonly problem: "chain" | "expired" | "revoked" | "signing-domain" | null;
  };
  /** Errors {@link getSession} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

/** Path of the action, e.g. for cache keys. */
getSession.path = "hca.getSession" as const;
