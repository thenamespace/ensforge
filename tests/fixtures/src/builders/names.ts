import { keccak256, labelhash, stringToHex, type Hex } from "viem";

/** Deterministic commitment secret per name. */
export const secretFor = (name: string): Hex => keccak256(stringToHex(`ensforge-fixture:${name}`));

/** ERC-721 / ENSv2 label ID. */
export const labelId = (label: string): bigint => BigInt(labelhash(label));
