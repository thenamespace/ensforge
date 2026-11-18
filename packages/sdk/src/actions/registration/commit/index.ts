import type { Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { register } from "../register/index.js";
import * as Impl from "./effect.js";

/**
 * Commits to registering `.eth` names, the first half of a registration. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use when registration is split across sessions or devices; `register` alone does both halves. Use {@link commitSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Takes the same options as {@link Actions.registration.register}; they are hashed into the commitment.
 * - Keep the returned `secret`, then call `register` with the same options and `secret` once the
 *   commitment is ready (see {@link Actions.registration.getCommitmentStatus}).
 *
 * **Gotchas**
 *
 * - `.prepare` and `.simulate` without `secret` use a throwaway secret.
 *
 * **Example** (Committing to a name)
 *
 * ```ts
 * const { secret, commitments } = await ens.registration.commit({ names: "alice.eth", duration: 31536000n })
 * ```
 *
 * **Example** (Committing to a name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registration.commit(ens, { names: "alice.eth", duration: 31536000n })
 * ```
 *
 * **Example** (Committing to a name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registration.commit(ens, { names: "alice.eth", duration: 31536000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `DURATION_TOO_SHORT`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_AVAILABLE`) when a name is taken or in its grace period.
 * @throws `Errors.CommitmentError` (`COMMITMENT_TOO_NEW`, `COMMITMENT_TOO_OLD`, `COMMITMENT_EXISTS`) for a resumed commitment outside its window.
 * @throws `Errors.UnsupportedError` (`PAYMENT_TOKEN_UNSUPPORTED`, `UNSUPPORTED_ON_DEPLOYMENT`) for an unaccepted token or without ENSv2.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.registration.register} to finish
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function commit(
  client: Like,
  options: commit.Options & Write.Options,
): Promise<commit.ReturnType> {
  return Action.promise("registration.commit", Impl.commit, client, options);
}

export declare namespace commit {
  /** Options for {@link commit}. */
  type Options = register.Options;
  /** Submitted hashes, the plan, the secret and the commitments. */
  type ReturnType = Write.Result & { readonly secret: Hex; readonly commitments: readonly Hex[] };
  /** Errors {@link commit} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.CommitmentError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
commit.prepare = Action.promiseOf(
  "registration.commit.prepare",
  Impl.commitMethods.prepare,
) as Write.Method<commit.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
commit.simulate = Action.promiseOf(
  "registration.commit.simulate",
  Impl.commitMethods.simulate,
) as Write.Method<commit.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
commit.estimateGas = Action.promiseOf(
  "registration.commit.estimateGas",
  Impl.commitMethods.estimateGas,
) as Write.Method<commit.Options, Plan.Estimate>;

/**
 * Commits to registering `.eth` names, the first half of a registration. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Committing to a name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.registration.commitSync({ names: "alice.eth", duration: 31536000n })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registration.commitSync(ens, { names: "alice.eth", duration: 31536000n })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registration.commitSync(ens, { names: "alice.eth", duration: 31536000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `DURATION_TOO_SHORT`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_AVAILABLE`) when a name is taken or in its grace period.
 * @throws `Errors.CommitmentError` (`COMMITMENT_TOO_NEW`, `COMMITMENT_TOO_OLD`, `COMMITMENT_EXISTS`) for a resumed commitment outside its window.
 * @throws `Errors.UnsupportedError` (`PAYMENT_TOKEN_UNSUPPORTED`, `UNSUPPORTED_ON_DEPLOYMENT`) for an unaccepted token or without ENSv2.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link commit} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function commitSync(
  client: Like,
  options: commitSync.Options,
): Promise<commitSync.ReturnType> {
  return Action.promise("registration.commitSync", Impl.commitSync, client, options);
}

export declare namespace commitSync {
  /** Options for {@link commitSync}. */
  type Options = commit.Options & Write.SyncOptions;
  /** Receipts, the secret, the commitments and when they can be used. */
  type ReturnType = Write.SyncResult & {
    readonly secret: Hex;
    readonly commitments: readonly Hex[];
    readonly readyAt: bigint;
  };
  /** Errors {@link commitSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.CommitmentError;
}

/** Path of the action, e.g. for cache keys. */
commit.path = "registration.commit" as const;

/** Path of the action, e.g. for cache keys. */
commitSync.path = "registration.commitSync" as const;
