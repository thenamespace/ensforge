import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { DevnetInstance } from "@ensforge/test-devnet";
import { erc20Abi, type Address } from "viem";

/** A `.eth` label's ENSv2 entry, read from the ETH registry itself. */
export const ethEntry = (devnet: DevnetInstance, label: string) => {
  const registry = devnet.contracts["v2.ethRegistry"] as Address;
  const read = <A>(functionName: "findOwner" | "findExpiry" | "findTokenId") =>
    Effect.promise(
      () =>
        devnet.client.readContract({
          address: registry,
          abi: Abis.v2.permissionedRegistry,
          functionName,
          args: [label],
        }) as Promise<A>,
    );
  return Effect.all({
    owner: read<Address>("findOwner"),
    expiry: read<bigint>("findExpiry"),
    tokenId: read<bigint>("findTokenId"),
  });
};

/** `account`'s USDC balance. */
export const usdcOf = (devnet: DevnetInstance, account: Address) =>
  Effect.promise(() =>
    devnet.client.readContract({
      address: devnet.contracts["v2.usdc"] as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    }),
  );
