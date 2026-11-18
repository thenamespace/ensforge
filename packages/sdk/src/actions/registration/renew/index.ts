import type { Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { PaymentToken } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Renews one or more `.eth` names, ENSv1 or ENSv2, paying in an ERC-20 token. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to extend names, including names in their grace period. Use {@link renewSync} to wait for the receipt.
 *
 * **Details**
 *
 * - ENSv2 names renew through the `ETHRegistrar`, names still on ENSv1 through `ETHRenewerV1`
 *   (which also extends wrapped names); each route is one `renewBatch` call.
 * - Token approvals are added for each contract whose allowance is short.
 * - Anyone can renew any name; the payer is the signer.
 * - A name listed twice is renewed once, for `duration`.
 *
 * **Example** (Renewing names)
 *
 * ```ts
 * const { hash } = await ens.registration.renew({ names: ["alice.eth", "bob.eth"], duration: 31536000n })
 * ```
 *
 * **Example** (Renewing names with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registration.renew(ens, { names: ["alice.eth", "bob.eth"], duration: 31536000n })
 * ```
 *
 * **Example** (Renewing names in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registration.renew(ens, { names: ["alice.eth", "bob.eth"], duration: 31536000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `DURATION_TOO_SHORT`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_RENEWABLE`) when a name is neither registered nor in its grace period.
 * @throws `Errors.InsufficientFundsError` (`INSUFFICIENT_TOKEN_BALANCE`, `INSUFFICIENT_ETH`) when the signer cannot pay.
 * @throws `Errors.UnsupportedError` (`PAYMENT_TOKEN_UNSUPPORTED`, `UNSUPPORTED_ON_DEPLOYMENT`) for an unaccepted token or without ENSv2.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.registration.getRenewalPrice} to quote it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function renew(
  client: Like,
  options: renew.Options & Write.Options,
): Promise<renew.ReturnType> {
  return Action.promise("registration.renew", Impl.renew, client, options);
}

export declare namespace renew {
  /** Options for {@link renew}. */
  type Options = {
    /** One or more `.eth` second-level names. Normalized automatically. */
    names: string | readonly string[];
    /** Renewal length in seconds. */
    duration: bigint;
    /**
     * Token to pay with.
     *
     * @default "usdc"
     */
    paymentToken?: PaymentToken | undefined;
    /** Referrer recorded by the registrar: 32 bytes, or an address (left-padded). */
    referrer?: Hex | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link renew} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError | Errors.NameStateError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
renew.prepare = Action.promiseOf(
  "registration.renew.prepare",
  Impl.renewMethods.prepare,
) as Write.Method<renew.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
renew.simulate = Action.promiseOf(
  "registration.renew.simulate",
  Impl.renewMethods.simulate,
) as Write.Method<renew.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
renew.estimateGas = Action.promiseOf(
  "registration.renew.estimateGas",
  Impl.renewMethods.estimateGas,
) as Write.Method<renew.Options, Plan.Estimate>;

/**
 * Renews one or more `.eth` names, ENSv1 or ENSv2, paying in an ERC-20 token. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Renewing names and waiting)
 *
 * ```ts
 * const { receipt } = await ens.registration.renewSync({ names: ["alice.eth", "bob.eth"], duration: 31536000n })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registration.renewSync(ens, { names: ["alice.eth", "bob.eth"], duration: 31536000n })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registration.renewSync(ens, { names: ["alice.eth", "bob.eth"], duration: 31536000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `DURATION_TOO_SHORT`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_RENEWABLE`) when a name is neither registered nor in its grace period.
 * @throws `Errors.InsufficientFundsError` (`INSUFFICIENT_TOKEN_BALANCE`, `INSUFFICIENT_ETH`) when the signer cannot pay.
 * @throws `Errors.UnsupportedError` (`PAYMENT_TOKEN_UNSUPPORTED`, `UNSUPPORTED_ON_DEPLOYMENT`) for an unaccepted token or without ENSv2.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link renew} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function renewSync(client: Like, options: renewSync.Options): Promise<renewSync.ReturnType> {
  return Action.promise("registration.renewSync", Impl.renewSync, client, options);
}

export declare namespace renewSync {
  /** Options for {@link renewSync}. */
  type Options = renew.Options & Write.SyncOptions;
  /** Receipts, the new expiry of each name and the amount paid. */
  type ReturnType = Write.SyncResult & {
    readonly names: readonly { readonly name: string; readonly expiry: bigint }[];
    readonly paid: bigint;
  };
  /** Errors {@link renewSync} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError | Errors.NameStateError;
}

/** Path of the action, e.g. for cache keys. */
renew.path = "registration.renew" as const;

/** Path of the action, e.g. for cache keys. */
renewSync.path = "registration.renewSync" as const;
