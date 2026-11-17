import { bytesToHex, keccak256, labelhash, namehash, stringToHex, type Hex } from "viem";
import { packetToBytes } from "viem/ens";

/** A name in DNS wire format, as PermissionedResolver setters and `wrap` take it. */
export const dnsEncode = (name: string): Hex => bytesToHex(packetToBytes(name));

/** Deterministic commitment secret per name. */
export const secretFor = (name: string): Hex => keccak256(stringToHex(`ensforge-fixture:${name}`));

/** ERC-721 / ENSv2 label ID. */
export const labelId = (label: string): bigint => BigInt(labelhash(label));

/** `name`, its node and its first label. */
export const nameParts = (name: string) => ({
  name,
  node: namehash(name),
  label: name.split(".")[0] as string,
  labelhash: labelhash(name.split(".")[0] as string),
});
