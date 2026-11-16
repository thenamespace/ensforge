/**
 * DNS record resolver profile for wire-format DNS records.
 *
 * @since 1.0.0
 */
export const dnsRecordResolverAbi = [
  {
    type: "event",
    name: "DNSRecordChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "name", type: "bytes", indexed: false },
      { name: "resource", type: "uint16", indexed: false },
      { name: "record", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DNSRecordDeleted",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "name", type: "bytes", indexed: false },
      { name: "resource", type: "uint16", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "function",
    name: "dnsRecord",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "name", type: "bytes32" },
      { name: "resource", type: "uint16" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "hasDNSRecords",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "name", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * ERC-165 interface ID of {@link dnsRecordResolverAbi}.
 *
 * @since 1.0.0
 */
export const dnsRecordResolverInterfaceId = "0xa8fa5682" as const;
