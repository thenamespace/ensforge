/**
 * Complete DNSSEC ABI from @ensdomains/ens-contracts v1.7.0.
 *
 * @stability stable
 * @since 1.0.0
 */
export const dnssecOracleV1InterfaceAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint8",
        name: "id",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "AlgorithmUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint8",
        name: "id",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "DigestUpdated",
    type: "event",
  },
  {
    inputs: [],
    name: "anchors",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "rrset",
            type: "bytes",
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes",
          },
        ],
        internalType: "struct DNSSEC.RRSetWithSignature[]",
        name: "input",
        type: "tuple[]",
      },
      {
        internalType: "uint256",
        name: "now",
        type: "uint256",
      },
    ],
    name: "verifyRRSet",
    outputs: [
      {
        internalType: "bytes",
        name: "rrs",
        type: "bytes",
      },
      {
        internalType: "uint32",
        name: "inception",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "rrset",
            type: "bytes",
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes",
          },
        ],
        internalType: "struct DNSSEC.RRSetWithSignature[]",
        name: "input",
        type: "tuple[]",
      },
    ],
    name: "verifyRRSet",
    outputs: [
      {
        internalType: "bytes",
        name: "rrs",
        type: "bytes",
      },
      {
        internalType: "uint32",
        name: "inception",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Complete DNSSECImpl ABI from @ensdomains/ens-contracts v1.7.0.
 *
 * @stability stable
 * @since 1.0.0
 */
export const dnssecOracleV1Abi = [
  {
    inputs: [
      {
        internalType: "bytes",
        name: "_anchors",
        type: "bytes",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "class",
        type: "uint16",
      },
    ],
    name: "InvalidClass",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "name",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "labelsExpected",
        type: "uint256",
      },
    ],
    name: "InvalidLabelCount",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "proofType",
        type: "uint16",
      },
    ],
    name: "InvalidProofType",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidRRSet",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "rrsetName",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "signerName",
        type: "bytes",
      },
    ],
    name: "InvalidSignerName",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "signerName",
        type: "bytes",
      },
    ],
    name: "NoMatchingProof",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "offset",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "length",
        type: "uint256",
      },
    ],
    name: "OffsetOutOfBoundsError",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "signerName",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "proofName",
        type: "bytes",
      },
    ],
    name: "ProofNameMismatch",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "expiration",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "now",
        type: "uint32",
      },
    ],
    name: "SignatureExpired",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint32",
        name: "inception",
        type: "uint32",
      },
      {
        internalType: "uint32",
        name: "now",
        type: "uint32",
      },
    ],
    name: "SignatureNotValidYet",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "rrsetType",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "sigType",
        type: "uint16",
      },
    ],
    name: "SignatureTypeMismatch",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint8",
        name: "id",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "AlgorithmUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint8",
        name: "id",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "DigestUpdated",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    name: "algorithms",
    outputs: [
      {
        internalType: "contract Algorithm",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "anchors",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    name: "digests",
    outputs: [
      {
        internalType: "contract Digest",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "id",
        type: "uint8",
      },
      {
        internalType: "contract Algorithm",
        name: "algo",
        type: "address",
      },
    ],
    name: "setAlgorithm",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "id",
        type: "uint8",
      },
      {
        internalType: "contract Digest",
        name: "digest",
        type: "address",
      },
    ],
    name: "setDigest",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "setOwner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "rrset",
            type: "bytes",
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes",
          },
        ],
        internalType: "struct DNSSEC.RRSetWithSignature[]",
        name: "input",
        type: "tuple[]",
      },
      {
        internalType: "uint256",
        name: "now",
        type: "uint256",
      },
    ],
    name: "verifyRRSet",
    outputs: [
      {
        internalType: "bytes",
        name: "rrs",
        type: "bytes",
      },
      {
        internalType: "uint32",
        name: "inception",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "rrset",
            type: "bytes",
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes",
          },
        ],
        internalType: "struct DNSSEC.RRSetWithSignature[]",
        name: "input",
        type: "tuple[]",
      },
    ],
    name: "verifyRRSet",
    outputs: [
      {
        internalType: "bytes",
        name: "rrs",
        type: "bytes",
      },
      {
        internalType: "uint32",
        name: "inception",
        type: "uint32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
