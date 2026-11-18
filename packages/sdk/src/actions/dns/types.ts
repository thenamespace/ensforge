import type { Address, Hex } from "viem";

/**
 * One signed RRSet of a DNSSEC proof, as DNSSEC gateways return it and `DNSRegistrar` accepts
 * it: the RRSIG data with its records, and the signature.
 *
 * @category dns
 * @since 1.0.0
 */
export type SignedRRSet = {
  readonly rrset: Hex;
  readonly sig: Hex;
};

/**
 * A DNSSEC proof of one DNS record set, from the root zone's keys down to the record.
 *
 * @category dns
 * @since 1.0.0
 */
export type Proof = {
  /** DNS name the proof is for, e.g. `_ens.example.com`. */
  readonly name: string;
  /** Signed RRSets, root first. */
  readonly rrsets: readonly SignedRRSet[];
  /** Signature inception of the proven record set, as a Unix timestamp; `0` when it does not exist. */
  readonly inception: number;
  /** Signature expiration of the proven record set, as a Unix timestamp; `0` when it does not exist. */
  readonly expiration: number;
  /** TXT strings of the proven record set; empty when the record does not exist. */
  readonly txt: readonly string[];
};

/**
 * What a DNS name needs before it is usable in ENS:
 *
 * - `none`: it is imported and owned by the address in its `_ens` TXT record.
 * - `claim`: import it, or re-import it to move it to the address in its TXT record.
 * - `set-txt-record`: add a `_ens` TXT record `a=<address>` to the DNS zone first.
 * - `proof-invalid`: the TXT record exists, but its DNSSEC proof does not verify on-chain.
 *
 * @category dns
 * @since 1.0.0
 */
export type ImportAction = "none" | "claim" | "set-txt-record" | "proof-invalid";

/**
 * Import state of a DNS name.
 *
 * @category dns
 * @since 1.0.0
 */
export type Status = {
  /** Normalized name. */
  readonly name: string;
  /** Whether the name is in the ENSv1 registry. */
  readonly imported: boolean;
  /** ENSv1 registry owner, or `null` when not imported. */
  readonly owner: Address | null;
  /** Address in the `_ens` TXT record (`a=0x…`), or `null` when there is none. */
  readonly dnsOwner: Address | null;
  /** Whether the DNSSEC proof of the TXT record verifies against the on-chain DNSSEC oracle. */
  readonly proofValid: boolean;
  /** Inception of the last imported proof, or `null` when none was imported. */
  readonly importedInception: number | null;
  /** Inception of the current DNSSEC proof. */
  readonly proofInception: number;
  readonly action: ImportAction;
};

/**
 * Gasless DNS configuration from an `ENS1` TXT record on the DNS name itself.
 *
 * @category dns
 * @since 1.0.0
 */
export type OffchainResolver = {
  /** Resolver address or ENS name the record points to. */
  readonly resolver: string;
  /** Extra data passed to the resolver, or `null`. */
  readonly context: string | null;
};
