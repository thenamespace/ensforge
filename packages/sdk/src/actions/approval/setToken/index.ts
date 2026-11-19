import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Approves one address to transfer one ENSv1 name token, or clears the approval. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to let a buyer or escrow take a single name. Use {@link setTokenSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Wrapped names approve on the NameWrapper (blocked by `cannotApprove`); unwrapped `.eth`
 *   names on the BaseRegistrar.
 * - `to: null` clears it. ENSv2 names use operators instead.
 * - A name in an L2 namespace approves its token on its L2: Linea Names on their NameWrapper,
 *   other families on their ERC-721 registrar or registry. Basenames subnames have no token.
 *
 * **Example** (Approving a buyer)
 *
 * ```ts
 * const { hash } = await ens.approval.setToken({ name: "alice.eth", to: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Approving a buyer with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.approval.setToken(ens, { name: "alice.eth", to: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Approving a buyer in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.approval.setToken(ens, { name: "alice.eth", to: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) when the name is not registered, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names and unwrapped subnames.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not approve it.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.approval.getToken} to read it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setToken(
  client: Like,
  options: setToken.Options & Write.Options,
): Promise<setToken.ReturnType> {
  return Action.promise("approval.setToken", Impl.setToken, client, options);
}

export declare namespace setToken {
  /** Options for {@link setToken}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /** Address to approve, or `null` to clear. */
    to: string | null;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setToken} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setToken.prepare = Action.promiseOf(
  "approval.setToken.prepare",
  Impl.setTokenMethods.prepare,
) as Write.Method<setToken.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setToken.simulate = Action.promiseOf(
  "approval.setToken.simulate",
  Impl.setTokenMethods.simulate,
) as Write.Method<setToken.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setToken.estimateGas = Action.promiseOf(
  "approval.setToken.estimateGas",
  Impl.setTokenMethods.estimateGas,
) as Write.Method<setToken.Options, Plan.Estimate>;

/**
 * Approves one address to transfer one ENSv1 name token, or clears the approval. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Approving a buyer and waiting)
 *
 * ```ts
 * const { receipt } = await ens.approval.setTokenSync({ name: "alice.eth", to: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.approval.setTokenSync(ens, { name: "alice.eth", to: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.approval.setTokenSync(ens, { name: "alice.eth", to: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) when the name is not registered, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names and unwrapped subnames.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not approve it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link setToken} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setTokenSync(
  client: Like,
  options: setTokenSync.Options,
): Promise<setTokenSync.ReturnType> {
  return Action.promise("approval.setTokenSync", Impl.setTokenSync, client, options);
}

export declare namespace setTokenSync {
  /** Options for {@link setTokenSync}. */
  type Options = setToken.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setTokenSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
setToken.path = "approval.setToken" as const;

/** Path of the action, e.g. for cache keys. */
setTokenSync.path = "approval.setTokenSync" as const;
