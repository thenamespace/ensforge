import { keccak256, stringToHex, toHex, type Hex } from "viem";

import type { Namehash } from "../../schemas/hash.js";

export type ResolverRecord =
  | { readonly type: "address"; readonly coinType: bigint }
  | { readonly type: "text"; readonly key: string }
  | { readonly type: "contentHash" }
  | { readonly type: "pubkey" }
  | { readonly type: "abi"; readonly contentType?: bigint | undefined }
  | { readonly type: "interface"; readonly interfaceId?: Hex | undefined }
  | { readonly type: "name" }
  | { readonly type: "data"; readonly key: string }
  | { readonly type: "alias" }
  | { readonly type: "dnsRecord" }
  | { readonly type: "dnsZone" }
  | { readonly type: "clear" };

export const isResolverRecord = (operation: {
  readonly type: string;
}): operation is ResolverRecord =>
  operation.type === "address" ||
  operation.type === "text" ||
  operation.type === "contentHash" ||
  operation.type === "pubkey" ||
  operation.type === "abi" ||
  operation.type === "interface" ||
  operation.type === "name" ||
  operation.type === "data" ||
  operation.type === "alias" ||
  operation.type === "dnsRecord" ||
  operation.type === "dnsZone" ||
  operation.type === "clear";

export const resolverRecordRole = (record: ResolverRecord): bigint => {
  switch (record.type) {
    case "address":
      return 1n << 0n;
    case "text":
      return 1n << 4n;
    case "contentHash":
      return 1n << 8n;
    case "pubkey":
      return 0n;
    case "abi":
      return 1n << 12n;
    case "interface":
      return 1n << 16n;
    case "name":
      return 1n << 20n;
    case "alias":
      return 1n << 28n;
    case "clear":
      return 0n;
    case "data":
      return 1n << 24n;
    case "dnsRecord":
    case "dnsZone":
      return 0n;
  }
};

export const resolverRecordPart = (record: ResolverRecord): Hex => {
  switch (record.type) {
    case "address":
      return keccak256(toHex(record.coinType, { size: 32 }));
    case "text":
    case "data":
      return keccak256(stringToHex(record.key));
    case "abi":
      return record.contentType === undefined
        ? toHex(0n, { size: 32 })
        : keccak256(toHex(record.contentType, { size: 32 }));
    case "interface":
      return record.interfaceId === undefined
        ? toHex(0n, { size: 32 })
        : keccak256(record.interfaceId);
    case "contentHash":
    case "pubkey":
    case "name":
    case "alias":
    case "dnsRecord":
    case "dnsZone":
    case "clear":
      return toHex(0n, { size: 32 });
    default:
      return toHex(0n, { size: 32 });
  }
};

/** Permissioned Resolver resources are argument-scoped across every name it serves. */
export const resolverResource = (_node: Namehash, part: Hex): bigint => BigInt(part);
