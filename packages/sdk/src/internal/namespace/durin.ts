import { Array as Arr, Effect, String as Str } from "effect";

import { Abis, type Deployments } from "@ensforge/contracts";
import { namehash } from "viem";

import type { NameNamespace } from "../../actions/name/get/types.js";
import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { nonZeroAddress } from "../address.js";
import type { NameParts } from "../name/parts.js";
import { blockAt } from "../rpc/block.js";
import * as Rpc from "../rpc/index.js";
import { chainClient, hasChain } from "../write/chain.js";

/**
 * A Durin name: Durin's Ethereum resolver keys the second-level name (`sub.name.eth` →
 * `name.eth`) to its L2 chain and registry (`l2Registry`). When the L2 is reachable, the
 * registry must be that name's (`baseNode`), so a stale or wrong entry is not followed; when it
 * is not, Ethereum's answer is trusted.
 */
export const locateDurin = Effect.fnUntraced(function* (
  client: Client,
  parts: NameParts,
  durin: Deployments.DurinDeployment,
  block: Read.BlockOptions,
): Effect.fn.Return<NameNamespace | null, AnyError> {
  const parent = Arr.join(Str.split(".")(parts.name).slice(-2), ".");
  const node = namehash(parent);
  const [l2ChainId, address] = yield* Rpc.readContract(client, {
    address: durin.l1Resolver,
    abi: Abis.durin.interfaces.l1Resolver,
    functionName: "l2Registry",
    args: [node],
    ...blockAt(block),
  });
  const registry = nonZeroAddress(address);
  if (registry === null) return null;

  const chainId = Number(l2ChainId);
  if (hasChain(client, chainId)) {
    const matches = yield* chainClient(client, chainId).pipe(
      Effect.flatMap((l2) =>
        Rpc.readContract(l2, {
          address: registry,
          abi: Abis.durin.interfaces.l2Registry,
          functionName: "baseNode",
        }),
      ),
      Effect.map((baseNode) => baseNode === node),
      // An L2 that does not answer cannot contradict Ethereum; a contract without `baseNode` does.
      Effect.catch((error: AnyError) => Effect.succeed(error._tag === "NetworkError")),
    );
    if (!matches) return null;
  }
  return { kind: "l2", id: "durin", parent, chainId, registry };
});
