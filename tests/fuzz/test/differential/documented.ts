import { Array as Arr } from "effect";
/** Known differences: `profile fixture field: library` → why ensforge reads differently. */
export const documented: Readonly<Record<string, string>> = {};

const add = (reason: string, keys: readonly string[]) => {
  for (const key of keys) (documented as Record<string, string>)[key] = reason;
};

// Labels known only by their hash, written `[labelhash]` (ENSIP-15 encoded labels).
const encodedLabels = [
  "hierarchy.label-invalid-utf8",
  "hierarchy.label-literal-hex",
  "hierarchy.label-unknown",
  "hierarchy.label-unnormalized",
  "hierarchy.label-with-dot",
];
add(
  "ensjs refuses encoded `[labelhash]` labels; ensforge and viem resolve the name (no record).",
  Arr.flatMap(["v1-live", "v1-v2-greenfield", "mainnet-shaped", "v2-only"], (profile) =>
    Arr.map(encodedLabels, (id) => `${profile} ${id} address: ensjs`),
  ),
);

add(
  "ensjs throws when the resolver reverts or answers malformed data; ensforge and viem read no record.",
  [
    "v1-live resolver.empty-answer address: ensjs",
    "v1-live resolver.empty-answer url: ensjs",
    "v1-live resolver.gas-burner address: ensjs",
    "v1-live resolver.gas-burner url: ensjs",
    "v1-live resolver.malformed-answer url: ensjs",
    "v1-live resolver.no-erc165 url: ensjs",
    "v1-live resolver.returndata-bomb address: ensjs",
    "v1-live resolver.returndata-bomb url: ensjs",
    "v1-live resolver.unsupported-profile address: ensjs",
    "v1-live resolver.unsupported-profile url: ensjs",
    "v1-live v1.old-registry url: ensjs",
    "mainnet-shaped resolver.unsupported-profile address: ensjs",
    "mainnet-shaped resolver.unsupported-profile url: ensjs",
  ],
);

add(
  "ensforge reports an unreachable or invalid gateway as a GatewayError; viem and ensjs return null.",
  Arr.flatMap(["viem", "ensjs"], (library) => [
    `mainnet-shaped resolver.offchain address: ${library}`,
    `mainnet-shaped resolver.offchain url: ${library}`,
    `mainnet-shaped resolver.spoofed-offchain-lookup address: ${library}`,
  ]),
);

// This lane serves no namespace gateways: the Ethereum resolvers of `linea.eth` and
// `durin-names.eth` ask one about the parent name itself (Basenames', Celonames' and Namespace's
// answer their parent on-chain).
add(
  "ensforge reports the namespace parent's unserved gateway as a GatewayError; viem and ensjs return null.",
  Arr.flatMap(["viem", "ensjs"], (library) =>
    Arr.flatMap(["namespaces.parent.linea", "namespaces.parent.durin"], (id) => [
      `mainnet-shaped ${id} address: ${library}`,
      `mainnet-shaped ${id} url: ${library}`,
    ]),
  ),
);
