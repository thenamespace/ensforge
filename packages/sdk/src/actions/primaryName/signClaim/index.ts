import type { Account, Address, Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import * as Impl from "./effect.js";

/**
 * Signs a claim to a primary name on one or more L2s, with one signature and no transaction.
 * Anyone can then submit it on each chain with `primaryName.set`, so the account needs no gas or
 * wallet connection there.
 *
 * **When to use**
 *
 * Use to set the same primary name on several L2s with one prompt, or to let a server relay it
 * (sponsoring the L2 gas).
 *
 * **Details**
 *
 * - The claim is for the ens-contracts `L2ReverseRegistrar`: every mainnet L2 shares one, so one
 *   signature covers all of `chainIds`; testnets share another.
 * - It expires `expiresIn` seconds (at most one hour, the registrar's limit) after the latest block
 *   of the earliest of those chains: read on the chains the client has in `chains`, and on the
 *   ENS chain for the others.
 * - The account signs EIP-191 over the registrar's message. Smart accounts sign as themselves
 *   (ERC-1271, or ERC-6492 before they are deployed); the registrar checks the signature on each L2,
 *   where the account must exist (or be deployable).
 * - `address` names a contract the signer owns (`Ownable`): the claim says so, and the
 *   registrar checks the ownership on each L2.
 * - Before signing, checks that `name` resolves to the address on each chain (its address for
 *   that chain, or its default EVM address); `verify: false` skips this.
 * - The claim is plain JSON: send it to a relaying server as is.
 *
 * **Example** (One signature for several L2s)
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
 * // In the app: sign, and send the claim to your server.
 * const signed = await ens.primaryName.signClaim({ name: "alice.eth", chainIds: [8453] })
 * await fetch("/api/primary-name", { method: "POST", body: JSON.stringify(signed) })
 *
 * // On the server (`body` is the posted JSON), with a client whose `chains` has a funded
 * // wallet for Base:
 * const { claim, signature } = JSON.parse(body)
 * await relayer.primaryName.set({ claim, signature })
 * ```
 *
 * **Example** (Signing with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const signed = await Actions.primaryName.signClaim(ens, { name: "alice.eth", chainIds: [10] })
 * ```
 *
 * **Example** (Signing in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const signed = yield* Actions.primaryName.signClaim(ens, { name: "alice.eth", chainIds: [10] })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.InvalidInputError` (`INVALID_COIN_TYPE`) when `chainIds` is empty, includes the ENS chain, or mixes mainnet L2s and testnets.
 * @throws `Errors.InvalidInputError` (`INVALID_DURATION`) when `expiresIn` is not between 1 and 3600 seconds.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) for a chain without an L2 reverse registrar.
 * @throws `Errors.NotFoundError` (`PRIMARY_NAME_MISMATCH`) when the name does not resolve to the address on a chain.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.primaryName.set} to submit the claim
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function signClaim(client: Like, options: signClaim.Options): Promise<signClaim.ReturnType> {
  return Action.promise("primaryName.signClaim", Impl.signClaim, client, options);
}

export declare namespace signClaim {
  /** Options for {@link signClaim}. */
  type Options = {
    /** Primary name, or `null` to clear it. Normalized automatically. */
    name: string | null;
    /** The L2s the claim sets the primary name on, by chain ID. */
    chainIds: readonly number[];
    /**
     * Address to name: the signer's own, or a contract the signer owns (`Ownable`).
     *
     * @default the signing account
     */
    address?: string | undefined;
    /**
     * Seconds until the claim expires, at most one hour.
     *
     * @default 3600n
     */
    expiresIn?: bigint | undefined;
    /**
     * Check that `name` resolves to the address on each chain before signing.
     *
     * @default true
     */
    verify?: boolean | undefined;
    /**
     * Signer.
     *
     * @default the client's account
     */
    account?: Account | Address | undefined;
  };

  /** What the signature covers. Plain JSON, so it can be sent to a relaying server as is. */
  type Claim = {
    /** The L2 reverse registrar the claim is for; its address is part of the signed message. */
    readonly registrar: Address;
    /** The address being named. */
    readonly address: Address;
    /** The `Ownable` owner who signed for the contract at `address`; absent when it signed itself. */
    readonly owner?: Address | undefined;
    /** Normalized primary name; empty to clear it. */
    readonly name: string;
    /** Chain IDs of the L2s the claim covers. */
    readonly chainIds: readonly number[];
    /** Unix time in seconds after which the registrar rejects the claim. */
    readonly expiry: number;
  };

  /** The claim and its signature, for `primaryName.set` on each chain. */
  type ReturnType = { readonly claim: Claim; readonly signature: Hex };
  /** Errors {@link signClaim} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError | Errors.NotFoundError;
}

/** Path of the action, e.g. for cache keys. */
signClaim.path = "primaryName.signClaim" as const;
