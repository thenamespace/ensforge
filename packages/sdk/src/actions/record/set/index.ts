import type { Abi, Address, Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Writes records of an ENS name and resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to update a profile (texts, addresses, content hash and more) when the UI tracks
 * confirmation itself. Use {@link setSync} to wait for the receipt instead.
 *
 * **Details**
 *
 * - `null` deletes a record.
 * - All records are written in one `multicall` on the resolver.
 * - Works with ENSv1 resolvers and the ENSv2 PermissionedResolver; the kind is detected on-chain.
 * - The records go to the resolver set on the name in its registry, never to a wildcard resolver
 *   inherited from a parent.
 * - `resolver` writes the records to another resolver, then points the name at it, in one step:
 *   a rejected write never leaves the name on an empty resolver.
 * - The plan is simulated before the wallet prompt, so permission errors surface first.
 *
 * **Gotchas**
 *
 * - The ENSv2 PermissionedResolver has no `pubkey` records. `clear` there links the name to record
 *   0 (needs the root `link` role), so it reads the resolver's default record until new records
 *   are written.
 * - Older resolvers lack newer profiles; the ENSv1 public resolver has no `data` records, so the
 *   simulation reverts.
 * - `resolver: "default"` (the ENSv1 public resolver) is for ENSv1 names only; ENSv2 names pass the
 *   address of a resolver such as their own PermissionedResolver.
 *
 * **Example** (Updating a profile)
 *
 * ```ts
 * const { hash } = await ens.record.set({
 *   name: "alice.eth",
 *   texts: { url: "https://alice.dev" },
 *   addresses: { eth: "0x225f137127d9067788314bc7fcc1f36746a3c3B5" },
 * })
 * ```
 *
 * **Example** (Deleting a record with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.record.set(ens, { name: "alice.eth", texts: { url: null } })
 * ```
 *
 * **Example** (Switching to the public resolver in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const { hash } = yield* Actions.record.set(ens, {
 *   name: "alice.eth",
 *   resolver: "default",
 *   contentHash: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
 * })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_COIN_TYPE`, `INVALID_CONTENT_HASH`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver of its own.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`, `UNSUPPORTED_PROTOCOL`) for `pubkey` on a PermissionedResolver, or `resolver: "default"` on an ENSv2 name.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`) when the account may not edit records.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when the client has no wallet.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.record.get} to read records
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function set(client: Like, options: set.Options & Write.Options): Promise<set.ReturnType> {
  return Action.promise("record.set", Impl.set, client, options);
}

export declare namespace set {
  /** Options for {@link set}. */
  type Options = {
    /** ENS name to update. Normalized automatically. */
    name: string;
    /** Text records by key. `null` deletes the record. */
    texts?: Readonly<Record<string, string | null>> | undefined;
    /**
     * Address records by coin symbol (`eth`, `btc`) or decimal coin type (`"2147492101"`).
     * `null` deletes the record.
     */
    addresses?: Readonly<Record<string, string | null>> | undefined;
    /** Content hash URI such as `ipfs://…`. `null` deletes it. */
    contentHash?: string | null | undefined;
    /**
     * ABI record (ENSIP-4). An `Abi` is stored as JSON (content type 1); hex bytes are stored as
     * given under `contentType`. `null` deletes the record of that content type.
     */
    abi?: { contentType?: 1n | 2n | 4n | 8n | undefined; value: Abi | Hex | null } | undefined;
    /** SECP256k1 public key. `null` deletes it. Node-based resolvers only. */
    pubkey?: { x: Hex; y: Hex } | null | undefined;
    /** Name record (the `name()` of reverse names). `null` deletes it. */
    nameRecord?: string | null | undefined;
    /** ERC-165 interface implementers by 4-byte interface ID. `null` deletes one. */
    interfaces?: Readonly<Record<Hex, Address | null>> | undefined;
    /** Data records (ENSIP-24) by key. `null` deletes one. */
    data?: Readonly<Record<string, Hex | null>> | undefined;
    /** Deletes every existing record first. */
    clear?: boolean | undefined;
    /**
     * Writes the records to this resolver, then points the name at it.
     * `"default"` is the ENSv1 public resolver, for ENSv1 names only.
     */
    resolver?: Address | "default" | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link set} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
set.prepare = Action.promiseOf("record.set.prepare", Impl.setMethods.prepare) as Write.Method<
  set.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
set.simulate = Action.promiseOf("record.set.simulate", Impl.setMethods.simulate) as Write.Method<
  set.Options,
  Plan.Simulation
>;

/** Estimates the gas and ETH the plan needs. */
set.estimateGas = Action.promiseOf(
  "record.set.estimateGas",
  Impl.setMethods.estimateGas,
) as Write.Method<set.Options, Plan.Estimate>;

/**
 * Writes records of an ENS name and resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the records being confirmed on-chain.
 *
 * **Example** (Updating a profile URL and waiting)
 *
 * ```ts
 * const { receipt } = await ens.record.setSync({ name: "alice.eth", texts: { url: "https://alice.dev" } })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.record.setSync(ens, { name: "alice.eth", texts: { url: "https://alice.dev" } })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.record.setSync(ens, { name: "alice.eth", texts: { url: "https://alice.dev" } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_COIN_TYPE`, `INVALID_CONTENT_HASH`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver of its own.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`, `UNSUPPORTED_PROTOCOL`) for records or resolvers the name's resolver or protocol does not support.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`) when the account may not edit records.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link set} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setSync(client: Like, options: setSync.Options): Promise<setSync.ReturnType> {
  return Action.promise("record.setSync", Impl.setSync, client, options);
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
set.path = "record.set" as const;

/** Path of the action, e.g. for cache keys. */
setSync.path = "record.setSync" as const;
