import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import type { DevnetInstance } from "@ensforge/test-devnet";
import { erc20Abi, hexToBigInt, labelhash, namehash, type Abi, type Address } from "viem";

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

/** ENSv1 ownership of `name`: registry owner, registrar token holder (`.eth` 2LDs), wrapper owner. */
export const v1Owners = (devnet: DevnetInstance, name: string) => {
  const node = namehash(name);
  const label = name.split(".")[0] ?? "";
  const read = <A>(key: string, abi: Abi, functionName: string, args: readonly unknown[]) =>
    Effect.promise(() =>
      (
        devnet.client.readContract({
          address: devnet.contracts[key] as Address,
          abi,
          functionName,
          args,
        } as never) as Promise<A>
      ).catch(() => undefined),
    );
  return Effect.all({
    registry: read<Address>("v1.registry", Abis.v1.ensRegistry, "owner", [node]),
    registrant: read<Address>("v1.baseRegistrar", Abis.v1.baseRegistrar, "ownerOf", [
      BigInt(labelhash(label)),
    ]),
    wrapped: read<readonly [Address, number, bigint]>(
      "v1.nameWrapper",
      Abis.v1.nameWrapper,
      "getData",
      [hexToBigInt(node)],
    ),
  });
};
