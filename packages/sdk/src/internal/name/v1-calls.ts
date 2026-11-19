import { Abis } from "@ensforge/contracts";
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";

import type { Plan } from "../../plan/Plan.js";

// The ENSv1 registry and NameWrapper calls, shared by ENS and its L2 forks (Basenames, Linea
// Names). `to` is the registry, or the NameWrapper for a wrapped name: `setResolver`, `setTTL` and
// `setRecord` have the same signature on both.

const call = (to: Address, data: Hex): Plan.Call => ({ to, data, value: 0n });

/** Points `node` at `resolver`. */
export const setResolver = (to: Address, node: Hex, resolver: Address): Plan.Call =>
  call(
    to,
    encodeFunctionData({
      abi: Abis.v1.ensRegistry,
      functionName: "setResolver",
      args: [node, resolver],
    }),
  );

/** Sets the TTL of `node`. */
export const setTtl = (to: Address, node: Hex, ttl: bigint): Plan.Call =>
  call(
    to,
    encodeFunctionData({ abi: Abis.v1.ensRegistry, functionName: "setTTL", args: [node, ttl] }),
  );

/** Clears `node`'s owner and resolver, as its own owner. */
export const clearRecord = (to: Address, node: Hex): Plan.Call =>
  call(
    to,
    encodeFunctionData({
      abi: Abis.v1.ensRegistry,
      functionName: "setRecord",
      args: [node, zeroAddress, zeroAddress, 0n],
    }),
  );

/**
 * Writes a child's owner and resolver from its parent: in the registry by labelhash, or through
 * the NameWrapper (`wrapped`) by label, with fuses and expiry.
 */
export const setSubnodeRecord = (
  to: Address,
  wrapped: boolean,
  child: {
    readonly parentNode: Hex;
    readonly label: string;
    readonly labelhash: Hex;
    readonly owner: Address;
    readonly resolver: Address;
    readonly ttl?: bigint | undefined;
    readonly fuses?: number | undefined;
    readonly expiry?: bigint | undefined;
  },
): Plan.Call =>
  call(
    to,
    wrapped
      ? encodeFunctionData({
          abi: Abis.v1.nameWrapper,
          functionName: "setSubnodeRecord",
          args: [
            child.parentNode,
            child.label,
            child.owner,
            child.resolver,
            child.ttl ?? 0n,
            child.fuses ?? 0,
            child.expiry ?? 0n,
          ],
        })
      : encodeFunctionData({
          abi: Abis.v1.ensRegistry,
          functionName: "setSubnodeRecord",
          args: [child.parentNode, child.labelhash, child.owner, child.resolver, child.ttl ?? 0n],
        }),
  );
