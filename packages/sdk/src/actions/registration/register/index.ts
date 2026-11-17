import type { Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { set as recordSet } from "../../record/set/index.js";
import type { PaymentToken } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Registers one or more `.eth` names: approve, commit, wait, register, then records and primary name. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to buy names in one flow; the plan runs every transaction in order. Use {@link registerSync} to wait for the receipt.
 *
 * **Details**
 *
 * - The plan: approve the token (if the allowance is short) with the commit → wait the registrar's
 *   minimum commitment age on chain time → register (deploying each name's resolver) → records →
 *   primary name.
 * - The approval covers the quote plus 2%, since the price is charged at `register` and can drift
 *   (e.g. a decaying premium); only the actual price is paid.
 * - Paid in ERC-20 (USDC by default); the registrar does not accept ETH.
 * - By default each name gets its own PermissionedResolver with `records` written at creation; its
 *   ETH address defaults to the owner (`addresses: { eth: null }` leaves it unset).
 * - The result's `secret` resumes an interrupted registration: call again with the same options and `secret`.
 *
 * **Gotchas**
 *
 * - Resolves after the last transaction is submitted, at least a minute after the commit.
 * - Resuming needs exactly the same options: they are part of the commitment.
 *
 * **Example** (Registering a name)
 *
 * ```ts
 * const { secret } = await ens.registration.register({ names: "alice.eth", duration: 31536000n, records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * **Example** (Registering a name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registration.register(ens, { names: "alice.eth", duration: 31536000n, records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * **Example** (Registering a name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registration.register(ens, { names: "alice.eth", duration: 31536000n, records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `DURATION_TOO_SHORT`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_AVAILABLE`) when a name is taken or in its grace period.
 * @throws `Errors.CommitmentError` (`COMMITMENT_TOO_NEW`, `COMMITMENT_TOO_OLD`, `COMMITMENT_EXISTS`) for a resumed commitment outside its window.
 * @throws `Errors.InsufficientFundsError` (`INSUFFICIENT_TOKEN_BALANCE`) when the signer cannot pay.
 * @throws `Errors.UnsupportedError` (`PAYMENT_TOKEN_UNSUPPORTED`, `UNSUPPORTED_ON_DEPLOYMENT`) for an unaccepted token or without ENSv2.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.registration.getPrice} to quote it first
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function register(
  client: Like,
  options: register.Options & Write.Options,
): Promise<register.ReturnType> {
  return Action.promise("registration.register", Impl.register, client, options);
}

export declare namespace register {
  /** Options for {@link register}. */
  type Options = {
    /** One or more `.eth` second-level names; several share one plan. Normalized automatically. */
    names: string | readonly string[];
    /** Registration length in seconds, e.g. `Duration.years(1)`. */
    duration: bigint;
    /**
     * Owner of the names.
     *
     * @default the signing account
     */
    owner?: string | undefined;
    /**
     * Resolver for the names. By default each name gets its own PermissionedResolver, deployed in
     * the same plan with `records` written at creation. `"owned"` uses the signer's shared
     * PermissionedResolver (the ENS app's address), deployed once and reused; its roles cover
     * every name on it. `null` registers without a resolver.
     */
    resolver?: string | null | undefined;
    /** Records for every name, written when its resolver is created (or right after registering). */
    records?: Omit<recordSet.Options, "name" | "resolver" | "clear" | "pubkey"> | undefined;
    /** Set the (single) name as the signer's primary name; adds its `eth` address record. */
    primaryName?: boolean | undefined;
    /**
     * Token to pay with.
     *
     * @default "usdc"
     */
    paymentToken?: PaymentToken | undefined;
    /** ENSv2 registry for the names' subnames. */
    subregistry?: string | undefined;
    /** Referrer recorded by the registrar: 32 bytes, or an address (left-padded). */
    referrer?: Hex | undefined;
    /** Secret from an earlier `commit` or `register`, to finish that registration. */
    secret?: Hex | undefined;
  };
  /** Submitted hashes, the plan and the commitment secret. */
  type ReturnType = Write.Result & { readonly secret: Hex };
  /** Errors {@link register} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
register.prepare = Action.promiseOf(
  "registration.register.prepare",
  Impl.registerMethods.prepare,
) as Write.Method<register.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
register.simulate = Action.promiseOf(
  "registration.register.simulate",
  Impl.registerMethods.simulate,
) as Write.Method<register.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
register.estimateGas = Action.promiseOf(
  "registration.register.estimateGas",
  Impl.registerMethods.estimateGas,
) as Write.Method<register.Options, Plan.Estimate>;

/**
 * Registers one or more `.eth` names: approve, commit, wait, register, then records and primary name. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Registering a name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.registration.registerSync({ names: "alice.eth", duration: 31536000n, records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registration.registerSync(ens, { names: "alice.eth", duration: 31536000n, records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registration.registerSync(ens, { names: "alice.eth", duration: 31536000n, records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `DURATION_TOO_SHORT`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_AVAILABLE`) when a name is taken or in its grace period.
 * @throws `Errors.CommitmentError` (`COMMITMENT_TOO_NEW`, `COMMITMENT_TOO_OLD`, `COMMITMENT_EXISTS`) for a resumed commitment outside its window.
 * @throws `Errors.InsufficientFundsError` (`INSUFFICIENT_TOKEN_BALANCE`) when the signer cannot pay.
 * @throws `Errors.UnsupportedError` (`PAYMENT_TOKEN_UNSUPPORTED`, `UNSUPPORTED_ON_DEPLOYMENT`) for an unaccepted token or without ENSv2.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link register} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function registerSync(
  client: Like,
  options: registerSync.Options,
): Promise<registerSync.ReturnType> {
  return Action.promise("registration.registerSync", Impl.registerSync, client, options);
}

export declare namespace registerSync {
  /** Options for {@link registerSync}. */
  type Options = register.Options & Write.SyncOptions;
  /** Receipts, the registered names with token IDs and expiries, and the amount paid. */
  type ReturnType = Write.SyncResult & {
    readonly secret: Hex;
    readonly names: readonly {
      readonly name: string;
      readonly tokenId: bigint;
      readonly expiry: bigint;
    }[];
    readonly paid: bigint;
  };
  /** Errors {@link registerSync} can fail with. */
  type ErrorType = AnyError;
}
