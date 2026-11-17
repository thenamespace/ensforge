import type { Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Sets DNS records or the zonehash of a name on its public resolver. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to host DNS records in ENS, for DNS servers that read them from ENS. Use {@link setRecordsSync} to wait for the receipt.
 *
 * **Details**
 *
 * - `records`: resource records in DNS wire format; a record with no data deletes it.
 * - `zonehash: null` clears the zonehash.
 * - Only the ENS public resolvers store DNS records.
 *
 * **Example** (Setting a zonehash)
 *
 * ```ts
 * const { hash } = await ens.dns.setRecords({ name: "alice.eth", zonehash: "0xe301…" })
 * ```
 *
 * **Example** (Setting a zonehash with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.dns.setRecords(ens, { name: "alice.eth", zonehash: "0xe301…" })
 * ```
 *
 * **Example** (Setting a zonehash in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.dns.setRecords(ens, { name: "alice.eth", zonehash: "0xe301…" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) for resolvers without DNS records.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`) when the account may not edit the records.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.dns.getRecords} to read them
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setRecords(
  client: Like,
  options: setRecords.Options & Write.Options,
): Promise<setRecords.ReturnType> {
  return Action.promise("dns.setRecords", Impl.setRecords, client, options);
}

export declare namespace setRecords {
  /** Options for {@link setRecords}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /** Resource records in DNS wire format. */
    records?: Hex | undefined;
    /** Zonehash, or `null` to clear it. */
    zonehash?: Hex | null | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setRecords} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setRecords.prepare = Action.promiseOf(
  "dns.setRecords.prepare",
  Impl.setRecordsMethods.prepare,
) as Write.Method<setRecords.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setRecords.simulate = Action.promiseOf(
  "dns.setRecords.simulate",
  Impl.setRecordsMethods.simulate,
) as Write.Method<setRecords.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setRecords.estimateGas = Action.promiseOf(
  "dns.setRecords.estimateGas",
  Impl.setRecordsMethods.estimateGas,
) as Write.Method<setRecords.Options, Plan.Estimate>;

/**
 * Sets DNS records or the zonehash of a name on its public resolver. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Setting a zonehash and waiting)
 *
 * ```ts
 * const { receipt } = await ens.dns.setRecordsSync({ name: "alice.eth", zonehash: "0xe301…" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.dns.setRecordsSync(ens, { name: "alice.eth", zonehash: "0xe301…" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.dns.setRecordsSync(ens, { name: "alice.eth", zonehash: "0xe301…" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) for resolvers without DNS records.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`) when the account may not edit the records.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link setRecords} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setRecordsSync(
  client: Like,
  options: setRecordsSync.Options,
): Promise<setRecordsSync.ReturnType> {
  return Action.promise("dns.setRecordsSync", Impl.setRecordsSync, client, options);
}

export declare namespace setRecordsSync {
  /** Options for {@link setRecordsSync}. */
  type Options = setRecords.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setRecordsSync} can fail with. */
  type ErrorType = AnyError;
}

/** Path of the action, e.g. for cache keys. */
setRecords.path = "dns.setRecords" as const;

/** Path of the action, e.g. for cache keys. */
setRecordsSync.path = "dns.setRecordsSync" as const;
