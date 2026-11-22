import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Invalidates every session approval of the signer's HCA. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use when a session key may be lost or compromised, or to end all prompt-free access.
 *
 * **Details**
 *
 * - Bumps the HCA's session nonce; always the owner's own transaction, so `via` is ignored.
 * - An HCA that is not deployed yet is deployed first: a session signed for it would become
 *   usable as soon as anyone deployed it. The plan carries the warning `HCA_DEPLOYED`.
 *
 * **Example** (Revoking every session)
 *
 * ```ts
 * const { hash } = await ens.hca.revokeSessions({})
 * ```
 *
 * **Example** (Revoking every session with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.revokeSessions(ens, {})
 * ```
 *
 * **Example** (Revoking every session in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.revokeSessions(ens, {})
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function revokeSessions(
  client: Like,
  options: revokeSessions.Options & Write.Options,
): Promise<revokeSessions.ReturnType> {
  return Action.promise("hca.revokeSessions", Impl.revokeSessions, client, options);
}

export declare namespace revokeSessions {
  /** Options for {@link revokeSessions}. */
  type Options = {};
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link revokeSessions} can fail with. */
  type ErrorType = Errors.WriteError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
revokeSessions.prepare = Action.promiseOf(
  "hca.revokeSessions.prepare",
  Impl.revokeSessionsMethods.prepare,
) as Write.Method<revokeSessions.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
revokeSessions.simulate = Action.promiseOf(
  "hca.revokeSessions.simulate",
  Impl.revokeSessionsMethods.simulate,
) as Write.Method<revokeSessions.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
revokeSessions.estimateGas = Action.promiseOf(
  "hca.revokeSessions.estimateGas",
  Impl.revokeSessionsMethods.estimateGas,
) as Write.Method<revokeSessions.Options, Plan.Estimate>;

/**
 * Invalidates every session approval of the signer's HCA. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Revoking every session and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hca.revokeSessionsSync({})
 * ```
 *
 * **Example** (Revoking every session with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.revokeSessionsSync(ens, {})
 * ```
 *
 * **Example** (Revoking every session in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.revokeSessionsSync(ens, {})
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link revokeSessions} to resolve on submission
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function revokeSessionsSync(
  client: Like,
  options: revokeSessionsSync.Options,
): Promise<revokeSessionsSync.ReturnType> {
  return Action.promise("hca.revokeSessionsSync", Impl.revokeSessionsSync, client, options);
}

export declare namespace revokeSessionsSync {
  /** Options for {@link revokeSessionsSync}. */
  type Options = revokeSessions.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link revokeSessionsSync} can fail with. */
  type ErrorType = Errors.WriteError | HcaError;
}

/** Path of the action, e.g. for cache keys. */
revokeSessions.path = "hca.revokeSessions" as const;

/** Path of the action, e.g. for cache keys. */
revokeSessionsSync.path = "hca.revokeSessionsSync" as const;
