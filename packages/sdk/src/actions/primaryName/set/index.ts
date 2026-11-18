import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Sets or clears the primary name (reverse record) of an address. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to choose the name wallets and apps show for an address. Use {@link setSync} to wait for the receipt.
 *
 * **Details**
 *
 * - `coin: "eth"` (default) sets the Ethereum primary name in `addr.reverse`; `"default"` sets the
 *   fallback for every EVM chain in `default.reverse` (ENSIP-19).
 * - An `addr.reverse` name outranks `default.reverse` on Ethereum, so `"default"` also sets
 *   `addr.reverse` when it holds a different name.
 * - A default name with only an Ethereum address verifies on Ethereum alone; the plan carries a
 *   `DEFAULT_PRIMARY_NAME_ETHEREUM_ONLY` warning.
 * - `address` names another account: the signer must be its operator or, for a contract, its
 *   Ownable owner (or ContractNamer for `"default"`).
 * - Before sending, checks that the name resolves back to the address, as readers require.
 * - `name: null` clears it.
 * - Names with encoded labels (`[af2c…]`) are rejected: readers show only normalized names.
 *
 * **Gotchas**
 *
 * - Primary names for other chains (`<coinType>.reverse`) are set on those chains.
 *
 * **Example** (Setting a primary name)
 *
 * ```ts
 * const { hash } = await ens.primaryName.set({ name: "alice.eth" })
 * ```
 *
 * **Example** (Setting a primary name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.primaryName.set(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Setting a primary name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.primaryName.set(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`PRIMARY_NAME_MISMATCH`) when the name does not resolve to the address.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UnauthorizedError` (`NOT_APPROVED`) when the signer may not name the address.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.primaryName.get} to read it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function set(client: Like, options: set.Options & Write.Options): Promise<set.ReturnType> {
  return Action.promise("primaryName.set", Impl.set, client, options);
}

export declare namespace set {
  /** Options for {@link set}. */
  type Options = {
    /** Primary name, or `null` to clear it. Normalized automatically. */
    name: string | null;
    /**
     * Address to name.
     *
     * @default the signing account
     */
    address?: string | undefined;
    /**
     * `"eth"` for Ethereum (`addr.reverse`), `"default"` for every EVM chain (`default.reverse`).
     *
     * @default "eth"
     */
    coin?: "eth" | "default" | undefined;
    /**
     * Check that `name` resolves to the address before sending.
     *
     * @default true
     */
    verify?: boolean | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link set} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
set.prepare = Action.promiseOf("primaryName.set.prepare", Impl.setMethods.prepare) as Write.Method<
  set.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
set.simulate = Action.promiseOf(
  "primaryName.set.simulate",
  Impl.setMethods.simulate,
) as Write.Method<set.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
set.estimateGas = Action.promiseOf(
  "primaryName.set.estimateGas",
  Impl.setMethods.estimateGas,
) as Write.Method<set.Options, Plan.Estimate>;

/**
 * Sets or clears the primary name (reverse record) of an address. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Setting a primary name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.primaryName.setSync({ name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.primaryName.setSync(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.primaryName.setSync(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`PRIMARY_NAME_MISMATCH`) when the name does not resolve to the address.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UnauthorizedError` (`NOT_APPROVED`) when the signer may not name the address.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link set} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setSync(client: Like, options: setSync.Options): Promise<setSync.ReturnType> {
  return Action.promise("primaryName.setSync", Impl.setSync, client, options);
}

export declare namespace setSync {
  /** Options for {@link setSync}. */
  type Options = set.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setSync} can fail with. */
  type ErrorType = AnyError;
}

/** Path of the action, e.g. for cache keys. */
set.path = "primaryName.set" as const;

/** Path of the action, e.g. for cache keys. */
setSync.path = "primaryName.setSync" as const;
