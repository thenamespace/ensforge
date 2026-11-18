/**
 * Off-chain DNSSEC gateway interface (`IDNSGateway`, ENSIP-17): returns the signed RRSets that
 * prove a DNS record, in the shape `DNSRegistrar.proveAndClaim` and DNSSEC oracles accept.
 *
 * @stability stable
 * @since 1.0.0
 */
export const dnssecGatewayAbi = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "qtype", type: "uint16" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "rrset", type: "bytes" },
          { name: "sig", type: "bytes" },
        ],
      },
    ],
  },
] as const;
