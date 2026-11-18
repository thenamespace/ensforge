import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { ApprovalContract } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Approves or revokes an operator for everything the signer holds on an ENS contract (`setApprovalForAll`). Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to let a marketplace or manager act on all your names in one contract. Use {@link setOperatorSync} to wait for the receipt.
 *
 * **Details**
 *
 * - `contract`: the ENSv1 `"registry"`, `"registrar"` or `"wrapper"`, or any ENSv2 registry
 *   or resolver by address.
 * - On ENSv2 registries an operator can transfer names; other changes need roles.
 *
 * **Example** (Approving a manager)
 *
 * ```ts
 * const { hash } = await ens.approval.setOperator({ operator: "0xB0b0000000000000000000000000000000000000", approved: true, contract: "wrapper" })
 * ```
 *
 * **Example** (Approving a manager with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.approval.setOperator(ens, { operator: "0xB0b0000000000000000000000000000000000000", approved: true, contract: "wrapper" })
 * ```
 *
 * **Example** (Approving a manager in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.approval.setOperator(ens, { operator: "0xB0b0000000000000000000000000000000000000", approved: true, contract: "wrapper" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for invalid addresses.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) for ENSv1 contracts without ENSv1.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.approval.getOperator} to read it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setOperator(
  client: Like,
  options: setOperator.Options & Write.Options,
): Promise<setOperator.ReturnType> {
  return Action.promise("approval.setOperator", Impl.setOperator, client, options);
}

export declare namespace setOperator {
  /** Options for {@link setOperator}. */
  type Options = {
    /** Account to approve or revoke. */
    operator: string;
    /** `true` to approve the operator, `false` to revoke it. */
    approved: boolean;
    /** `"registry"`, `"registrar"`, `"wrapper"`, or a registry or resolver address. */
    contract: ApprovalContract;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setOperator} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setOperator.prepare = Action.promiseOf(
  "approval.setOperator.prepare",
  Impl.setOperatorMethods.prepare,
) as Write.Method<setOperator.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setOperator.simulate = Action.promiseOf(
  "approval.setOperator.simulate",
  Impl.setOperatorMethods.simulate,
) as Write.Method<setOperator.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setOperator.estimateGas = Action.promiseOf(
  "approval.setOperator.estimateGas",
  Impl.setOperatorMethods.estimateGas,
) as Write.Method<setOperator.Options, Plan.Estimate>;

/**
 * Approves or revokes an operator for everything the signer holds on an ENS contract (`setApprovalForAll`). Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Approving a manager and waiting)
 *
 * ```ts
 * const { receipt } = await ens.approval.setOperatorSync({ operator: "0xB0b0000000000000000000000000000000000000", approved: true, contract: "wrapper" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.approval.setOperatorSync(ens, { operator: "0xB0b0000000000000000000000000000000000000", approved: true, contract: "wrapper" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.approval.setOperatorSync(ens, { operator: "0xB0b0000000000000000000000000000000000000", approved: true, contract: "wrapper" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for invalid addresses.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) for ENSv1 contracts without ENSv1.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link setOperator} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setOperatorSync(
  client: Like,
  options: setOperatorSync.Options,
): Promise<setOperatorSync.ReturnType> {
  return Action.promise("approval.setOperatorSync", Impl.setOperatorSync, client, options);
}

export declare namespace setOperatorSync {
  /** Options for {@link setOperatorSync}. */
  type Options = setOperator.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setOperatorSync} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError;
}

/** Path of the action, e.g. for cache keys. */
setOperator.path = "approval.setOperator" as const;

/** Path of the action, e.g. for cache keys. */
setOperatorSync.path = "approval.setOperatorSync" as const;
