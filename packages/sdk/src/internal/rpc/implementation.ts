import { Effect } from "effect";

import { getAddress, sliceHex, zeroHash, type Address } from "viem";
import { getStorageAt } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { nonZeroAddress } from "../address.js";
import { blockAt } from "./block.js";
import { fromPromise } from "./fromPromise.js";

// ERC-1967 implementation slot: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1).
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/**
 * The ERC-1967 implementation behind the proxy at `address`; `null` when it is no proxy.
 *
 * @stability unstable
 */
export const implementation = (
  client: Client,
  address: Address,
  options: Read.BlockOptions = {},
): Effect.Effect<Address | null, AnyError> =>
  fromPromise(() =>
    getStorageAt(client.client(), { address, slot: implementationSlot, ...blockAt(options) }),
  ).pipe(Effect.map((word) => nonZeroAddress(getAddress(sliceHex(word ?? zeroHash, 12)))));
