import type { Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as CoinType from "../../../utils/CoinType.js";
import type { signClaim } from "../signClaim/index.js";
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
 *   fallback for every EVM chain in `default.reverse` (ENSIP-19), as the ENS app does; `"all"`
 *   sets the default and, with `name: null`, clears both.
 * - An L2 such as `coin: { chainId: 8453 }` sets that chain's primary name in its reverse registrar,
 *   with a transaction on that chain: the client needs it in `chains` (`Ensforge.create`, or the
 *   wagmi config with `fromWagmi`). The plan is for that chain, and resumes there.
 * - `claim` and `signature` from `primaryName.signClaim` submit a signed claim instead, from any
 *   account: one signature sets the name on each of its chains, and a server can relay it.
 * - An `addr.reverse` entry outranks `default.reverse` on Ethereum, even with an empty name, so
 *   setting `"default"` also clears an `addr.reverse` entry that holds another name. Clearing
 *   `"eth"` removes the entry, so the default name applies on Ethereum again; clearing
 *   `"default"` leaves `addr.reverse` alone.
 * - Through `via: hca()`, the HCA sets the owner's name with the adapters' HCA entry points. An
 *   `"eth"` name has none, and a route that is not the signer's HCA cannot name the signer, so
 *   those go to the signer with a `PRIMARY_NAME_ROUTED_TO_SIGNER` warning. L2 primary names
 *   cannot go through such a route.
 * - A default name with only an Ethereum address verifies on Ethereum alone; the plan carries a
 *   `DEFAULT_PRIMARY_NAME_ETHEREUM_ONLY` warning.
 * - `address` names another account: the signer must be its registry operator or, for a contract,
 *   its Ownable owner or ContractNamer (ENSv2 `IContractNamer`); any other signer fails before
 *   sending. For `"eth"`, a ContractNamer goes through the ENSv2 adapter: it `claim`s the
 *   contract's `addr.reverse` node, which makes the signer that node's owner, then sets the name
 *   on the node's resolver.
 * - Before sending, checks that the name resolves back to the address, as readers require.
 * - `name: null` clears it.
 * - Names with encoded labels (`[af2c…]`) are rejected: readers show only normalized names.
 *
 * **Gotchas**
 *
 * - A ContractNamer's `"eth"` name takes two dependent calls: simulating them needs an RPC with
 *   `eth_simulateV1` (or `simulate: false`).
 * - Readers on Ethereum verify an L2 primary name against the L2's state as committed to
 *   Ethereum, so they see it only once that state is, which can take a while after the receipt.
 *
 * **Example** (Setting a primary name)
 *
 * ```ts
 * const { hash } = await ens.primaryName.set({ name: "alice.eth" })
 * ```
 *
 * **Example** (Setting the primary name on an L2)
 *
 * ```ts
 * import { Ensforge, ensActions } from "@ensforge/sdk"
 * import { mainnet } from "viem/chains"
 *
 * // The wallet is asked to switch to Base before the write.
 * const ens = Ensforge.create({ chain: mainnet, wallet: walletClient }).extend(ensActions())
 *
 * await ens.primaryName.set({ name: "alice.eth", coin: { chainId: 8453 } })
 * ```
 *
 * **Example** (Several L2s with one signature)
 *
 * ```ts
 * const signed = await ens.primaryName.signClaim({ name: "alice.eth", chainIds: [10, 8453] })
 *
 * await ens.primaryName.set({ ...signed, coin: { chainId: 10 } })
 * await ens.primaryName.set({ ...signed, coin: { chainId: 8453 } })
 * ```
 *
 * **Example** (A server relaying a claim)
 *
 * ```ts
 * // `body` is the JSON the app posted: the result of `primaryName.signClaim`.
 * const { claim, signature } = JSON.parse(body)
 *
 * await relayer.primaryName.set({ claim, signature, coin: { chainId: 8453 } })
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
 * @throws `Errors.InvalidInputError` (`INVALID_COIN_TYPE`) for a coin that is not an EVM chain, or a chain the claim does not cover.
 * @throws `Errors.NotFoundError` (`PRIMARY_NAME_MISMATCH`) when the name does not resolve to the address.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) with `ensureForward` when the name has no resolver to write its address to.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) for an L2 that is not in the client's `chains`.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) for a chain without an L2 reverse registrar.
 * @throws `Errors.UnauthorizedError` (`NOT_APPROVED`) when the signer may not name the address.
 * @throws `Errors.UnauthorizedError` (`SIGNATURE_INVALID`, `SIGNATURE_EXPIRED`) when the claim's signature is invalid or expired.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
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
  /** Options for {@link set}: a name to set, or a claim from `primaryName.signClaim` to submit. */
  type Options = NameOptions | ClaimOptions;

  /** Sets the name with the signer's own transaction. */
  type NameOptions = {
    /** Primary name, or `null` to clear it. Normalized automatically. */
    name: string | null;
    /**
     * Address to name.
     *
     * @default the signing account
     */
    address?: string | undefined;
    /**
     * Chain of the primary name: `"eth"` for Ethereum (`addr.reverse`), `"default"` for every EVM
     * chain (`default.reverse`), `"all"` for both (the default, and clearing both), or an L2 such
     * as `{ chainId: 8453 }` (its reverse registrar, sent on that chain through the client's
     * `chains`).
     *
     * @default "eth"
     */
    // oxlint-disable-next-line typescript/no-redundant-type-constituents -- the literal or explicit type argument documents the public type
    coin?: CoinType.Input | "default" | "all" | undefined;
    /**
     * Check that `name` resolves to the address before sending.
     *
     * @default true
     */
    verify?: boolean | undefined;
    /**
     * When `name` does not resolve to the signer, write its address record first instead of
     * failing: the ETH address for an Ethereum name, the default EVM address for `"default"` or
     * `"all"`. For the signer's own name on Ethereum coins only; set an L2 address with
     * `record.set` first.
     */
    ensureForward?: boolean | undefined;
    claim?: undefined;
    signature?: undefined;
  };

  /** Submits a signed claim on one of its L2s, from any account (a relayer pays the gas). */
  type ClaimOptions = {
    /** The claim from `primaryName.signClaim`. */
    claim: signClaim.Claim;
    /** Its signature. */
    signature: Hex;
    /**
     * The L2 to submit it on, one of the claim's chains.
     *
     * @default the claim's chain, when it covers one
     */
    coin?: CoinType.Input | undefined;
    /**
     * Check that the claimed name resolves to the address on that chain before sending.
     *
     * @default true
     */
    verify?: boolean | undefined;
    name?: undefined;
    address?: undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link set} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnauthorizedError;
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
 * @throws `Errors.InvalidInputError` (`INVALID_COIN_TYPE`) for a coin that is not an EVM chain, or a chain the claim does not cover.
 * @throws `Errors.NotFoundError` (`PRIMARY_NAME_MISMATCH`) when the name does not resolve to the address.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) with `ensureForward` when the name has no resolver to write its address to.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) for an L2 that is not in the client's `chains`.
 * @throws `Errors.UnauthorizedError` (`NOT_APPROVED`) when the signer may not name the address.
 * @throws `Errors.UnauthorizedError` (`SIGNATURE_INVALID`, `SIGNATURE_EXPIRED`) when the claim's signature is invalid or expired.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
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
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
set.path = "primaryName.set" as const;

/** Path of the action, e.g. for cache keys. */
setSync.path = "primaryName.setSync" as const;
