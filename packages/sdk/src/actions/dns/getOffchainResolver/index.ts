import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { OffchainResolver } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Reads the gasless DNS resolver a DNS name sets in an `ENS1` TXT record.
 *
 * **When to use**
 *
 * Use to check a gasless DNS setup, which resolves without importing the name.
 *
 * **Details**
 *
 * - Reads the TXT records of the name itself through the DNSSEC gateway, without verifying
 *   them on-chain.
 * - `null` when the name has no `ENS1 <resolver> [context]` record.
 *
 * **Example** (Reading a gasless DNS resolver)
 *
 * ```ts
 * const offchain = await ens.dns.getOffchainResolver({ name: "example.com" })
 * ```
 *
 * **Example** (Reading a gasless DNS resolver with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const offchain = await Actions.dns.getOffchainResolver(publicClient, { name: "example.com" })
 * ```
 *
 * **Example** (Reading a gasless DNS resolver in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const offchain = yield* Actions.dns.getOffchainResolver(ens, { name: "example.com" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for names that are not DNS names.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`) when the DNSSEC gateway fails.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without a DNSSEC gateway or `gatewayUrls`.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.record.get} to resolve its records
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getOffchainResolver(
  client: Like,
  options: getOffchainResolver.Options,
): Promise<getOffchainResolver.ReturnType> {
  return Action.promise("dns.getOffchainResolver", Impl.getOffchainResolver, client, options);
}

export declare namespace getOffchainResolver {
  /** Options for {@link getOffchainResolver}. */
  type Options = Pick<Read.Options, "signal"> & {
    /** DNS name. Normalized automatically. */
    name: string;
    /** DNSSEC gateways to use instead of the deployment's. */
    gatewayUrls?: readonly string[] | undefined;
  };
  /** The resolver and context, or `null`. */
  type ReturnType = OffchainResolver | null;
  /** Errors {@link getOffchainResolver} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getOffchainResolver.request = Action.request("dns.getOffchainResolver", Impl.getOffchainResolver);
