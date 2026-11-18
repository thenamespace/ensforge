/**
 * Migration receiver used when upgrading a wrapped V1 name.
 *
 * @stability stable
 * @since 1.0.0
 */
export const nameWrapperUpgradeV1Abi = [
  {
    type: "function",
    name: "wrapFromUpgrade",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "wrappedOwner", type: "address" },
      { name: "fuses", type: "uint32" },
      { name: "expiry", type: "uint64" },
      { name: "approved", type: "address" },
      { name: "extraData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
