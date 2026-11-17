import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { Status } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Reads whether a DNS name is imported into ENS, and what it needs to be.
 *
 * **When to use**
 *
 * Use to tell the user which step comes next, before {@link Actions.dns.claim}.
 *
 * **Details**
 *
 * - Compares the ENSv1 registry owner with the address in the `_ens` TXT record, and verifies
 *   the record's DNSSEC proof against the on-chain DNSSEC oracle.
 * - `action` is the next step: `none`, `claim`, `set-txt-record` or `proof-invalid`.
 * - Gasless DNS names (`ENS1` TXT records) resolve without importing; see
 *   {@link Actions.dns.getOffchainResolver}.
 *
 * **Example** (Checking a DNS name)
 *
 * ```ts
 * const status = await ens.dns.getStatus({ name: "example.com" })
 * ```
 *
 * **Example** (Checking a DNS name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const status = await Actions.dns.getStatus(publicClient, { name: "example.com" })
 * ```
 *
 * **Example** (Checking a DNS name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const status = yield* Actions.dns.getStatus(ens, { name: "example.com" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for names that are not DNS names.
 * @throws `Errors.GatewayError` (`GATEWAY_REQUEST_FAILED`, `GATEWAY_RESPONSE_INVALID`) when the DNSSEC gateway fails.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without a DNSSEC gateway or `gatewayUrls`.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.dns.claim} to import it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getStatus(client: Like, options: getStatus.Options): Promise<getStatus.ReturnType> {
  return Action.promise("dns.getStatus", Impl.getStatus, client, options);
}

export declare namespace getStatus {
  /** Options for {@link getStatus}. */
  type Options = Pick<Read.Options, "signal"> & {
    /** DNS name. Normalized automatically. */
    name: string;
    /** DNSSEC gateways to use instead of the deployment's. */
    gatewayUrls?: readonly string[] | undefined;
  };
  /** Import state and the next step. */
  type ReturnType = Status;
  /** Errors {@link getStatus} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getStatus.request = Action.request("dns.getStatus", Impl.getStatus);
