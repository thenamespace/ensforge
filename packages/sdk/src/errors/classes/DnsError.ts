import type { Address } from "viem";

import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in DnsError.Code]: (options: DnsError.Options) => EnsforgeError.Defaults;
} = {
  DNS_RECORD_MISSING: () => ({
    shortMessage: "The `_ens` TXT record is missing.",
    hint: 'Add a TXT record `_ens.<name>` with the value "a=<owner address>".',
  }),
  DNS_OWNER_MISMATCH: () => ({
    shortMessage: "The DNS owner differs from the on-chain owner.",
  }),
  DNSSEC_PROOF_FAILED: () => ({
    shortMessage: "The DNSSEC proof could not be built or verified.",
    hint: "Check that DNSSEC is enabled for the domain.",
  }),
  PROOF_STALE: () => ({
    shortMessage: "The DNSSEC proof is older than the one on-chain.",
    hint: "Fetch a fresh proof and retry.",
  }),
  TLD_NOT_PUBLIC: () => ({
    shortMessage: "The top-level domain is not a public suffix and cannot be imported.",
  }),
};

/**
 * Importing or reading a DNS name failed.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export class DnsError extends EnsforgeError<"DnsError", DnsError.Code> {
  readonly onchainOwner: Address | undefined;
  readonly dnsOwner: Address | undefined;

  constructor(options: DnsError.Options) {
    super("DnsError", withDefaults(defaults[options.code](options), options));
    this.onchainOwner = options.onchainOwner;
    this.dnsOwner = options.dnsOwner;
  }
}

export declare namespace DnsError {
  type Code =
    | "DNS_RECORD_MISSING"
    | "DNS_OWNER_MISMATCH"
    | "DNSSEC_PROOF_FAILED"
    | "PROOF_STALE"
    | "TLD_NOT_PUBLIC";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly onchainOwner?: Address | undefined;
    readonly dnsOwner?: Address | undefined;
  };
}
