import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { Proof } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Imports a DNS name into ENS with a DNSSEC proof of its `_ens` TXT record. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to claim a DNS name after adding the TXT record `_ens.<name>` = `a=<address>`. Use {@link claimSync} to wait for the receipt.
 *
 * **Details**
 *
 * - The name goes to the address in the TXT record, whoever sends the claim.
 * - The proof comes from the deployment's DNSSEC gateway unless `proof` is given.
 * - With `resolver`, the claim also sets it; then only the DNS owner may send it. Set records
 *   with {@link Actions.record.set} afterwards.
 *
 * **Gotchas**
 *
 * - Read {@link Actions.dns.getStatus} first: a proof that does not verify on-chain fails.
 *
 * **Example** (Claiming a DNS name)
 *
 * ```ts
 * const { hash } = await ens.dns.claim({ name: "example.com" })
 * ```
 *
 * **Example** (Claiming a DNS name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.dns.claim(ens, { name: "example.com" })
 * ```
 *
 * **Example** (Claiming a DNS name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.dns.claim(ens, { name: "example.com" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.DnsError` (`DNS_RECORD_MISSING`, `PROOF_STALE`, `DNSSEC_PROOF_FAILED`, `TLD_NOT_PUBLIC`) when the name cannot be proven.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`) when the proof cannot be fetched.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`) when someone other than the DNS owner claims with a resolver.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.dns.getStatus} to check the name first
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function claim(
  client: Like,
  options: claim.Options & Write.Options,
): Promise<claim.ReturnType> {
  return Action.promise("dns.claim", Impl.claim, client, options);
}

export declare namespace claim {
  /** Options for {@link claim}. */
  type Options = {
    /** DNS name. Normalized automatically. */
    name: string;
    /** Proof from {@link Actions.dns.getProof}, instead of fetching one. */
    proof?: Proof | undefined;
    /** Resolver to set while claiming. */
    resolver?: string | undefined;
    /** DNSSEC gateways to fetch the proof from, instead of the deployment's. */
    gatewayUrls?: readonly string[] | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link claim} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
claim.prepare = Action.promiseOf("dns.claim.prepare", Impl.claimMethods.prepare) as Write.Method<
  claim.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
claim.simulate = Action.promiseOf("dns.claim.simulate", Impl.claimMethods.simulate) as Write.Method<
  claim.Options,
  Plan.Simulation
>;

/** Estimates the gas and ETH the plan needs. */
claim.estimateGas = Action.promiseOf(
  "dns.claim.estimateGas",
  Impl.claimMethods.estimateGas,
) as Write.Method<claim.Options, Plan.Estimate>;

/**
 * Imports a DNS name into ENS with a DNSSEC proof of its `_ens` TXT record. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Claiming a DNS name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.dns.claimSync({ name: "example.com" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.dns.claimSync(ens, { name: "example.com" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.dns.claimSync(ens, { name: "example.com" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.DnsError` (`DNS_RECORD_MISSING`, `PROOF_STALE`, `DNSSEC_PROOF_FAILED`, `TLD_NOT_PUBLIC`) when the name cannot be proven.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`) when the proof cannot be fetched.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`) when someone other than the DNS owner claims with a resolver.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link claim} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function claimSync(client: Like, options: claimSync.Options): Promise<claimSync.ReturnType> {
  return Action.promise("dns.claimSync", Impl.claimSync, client, options);
}

export declare namespace claimSync {
  /** Options for {@link claimSync}. */
  type Options = claim.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link claimSync} can fail with. */
  type ErrorType = AnyError;
}

/** Path of the action, e.g. for cache keys. */
claim.path = "dns.claim" as const;

/** Path of the action, e.g. for cache keys. */
claimSync.path = "dns.claimSync" as const;
