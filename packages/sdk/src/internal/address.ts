import { isAddressEqual, zeroAddress, type Address } from "viem";

/** `address`, or `null` when it is missing or the zero address, which ENS contracts use for none. */
export const nonZeroAddress = (address: Address | null | undefined): Address | null =>
  address === undefined || address === null || isAddressEqual(address, zeroAddress)
    ? null
    : address;

/** Whether `a` is the address `b`; a missing `a` is no address. */
export const sameAddress = (a: Address | null | undefined, b: Address): boolean =>
  a !== null && a !== undefined && isAddressEqual(a, b);
