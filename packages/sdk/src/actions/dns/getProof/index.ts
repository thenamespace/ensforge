import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { Proof } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Fetches the DNSSEC proof of a DNS name's `_ens` TXT record.
 *
 * **When to use**
 *
 * Use to fetch a proof once and pass it to {@link Actions.dns.claim}, or to inspect it.
 *
 * **Details**
 *
 * - Fetched from the deployment's DNSSEC gateway (ENSIP-17) unless `gatewayUrls` is given.
 * - Not verified; {@link Actions.dns.getStatus} verifies it on-chain.
 *
 * **Example** (Fetching a proof)
 *
 * ```ts
 * const proof = await ens.dns.getProof({ name: "example.com" })
 * ```
 *
 * **Example** (Fetching a proof with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const proof = await Actions.dns.getProof(publicClient, { name: "example.com" })
 * ```
 *
 * **Example** (Fetching a proof in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const proof = yield* Actions.dns.getProof(ens, { name: "example.com" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for names that are not DNS names.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`) when the DNSSEC gateway fails.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without a DNSSEC gateway or `gatewayUrls`.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.dns.claim} to import with it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getProof(client: Like, options: getProof.Options): Promise<getProof.ReturnType> {
  return Action.promise("dns.getProof", Impl.getProof, client, options);
}

export declare namespace getProof {
  /** Options for {@link getProof}. */
  type Options = Pick<Read.Options, "signal"> & {
    /** DNS name. Normalized automatically. */
    name: string;
    /** DNSSEC gateways to use instead of the deployment's. */
    gatewayUrls?: readonly string[] | undefined;
  };
  /** Signed RRSets, the record's TXT strings and its signature times. */
  type ReturnType = Proof;
  /** Errors {@link getProof} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getProof.request = Action.request("dns.getProof", Impl.getProof);

/** Path of the action, e.g. for cache keys. */
getProof.path = "dns.getProof" as const;
