import { encodePacked, keccak256, stringToHex, type Hex } from "viem";

/**
 * The PermissionedResolver role resource that one record argument maps to: setters check this
 * resource, or the root, for their role. Matches `PermissionedResolver.decodeSetter` in
 * contracts-v2 v1.0.1 (`keccak256` of the raw key, or of the packed coin type, content type or
 * interface ID). Content hash and name records have no argument and only exist at the root.
 *
 * **Example** (The resource behind `setText(name, "url", …)`)
 *
 * ```ts
 * import { permissionedResolverResource } from "@ensforge/contracts/v2"
 *
 * permissionedResolverResource({ text: "url" })
 * ```
 *
 * @see https://github.com/ensdomains/contracts-v2/blob/v1.0.1/contracts/src/resolver/PermissionedResolver.sol
 * @since 1.0.0
 */
export const permissionedResolverResource = (
  record:
    | { readonly text: string }
    | { readonly data: string }
    | { readonly address: bigint }
    | { readonly abi: bigint }
    | { readonly interface: Hex },
): bigint => {
  if ("text" in record) return BigInt(keccak256(stringToHex(record.text)));
  if ("data" in record) return BigInt(keccak256(stringToHex(record.data)));
  if ("address" in record) return BigInt(keccak256(encodePacked(["uint256"], [record.address])));
  if ("abi" in record) return BigInt(keccak256(encodePacked(["uint256"], [record.abi])));
  return BigInt(keccak256(encodePacked(["bytes4"], [record.interface])));
};
