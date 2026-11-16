import { Effect } from "effect";

import { erc165Abi } from "@ensforge/contracts/shared";
import type { Address, Hex } from "viem";

import { EthereumClient } from "../client/ethereum-client.js";

export const supportsInterface = Effect.fn("supportsInterface")(function* (
  address: Address,
  interfaceId: Hex,
) {
  const ethereum = yield* EthereumClient;

  return yield* ethereum
    .readContract({
      address,
      abi: erc165Abi,
      functionName: "supportsInterface",
      args: [interfaceId],
    })
    .pipe(Effect.catchTag("ContractError", () => Effect.succeed(false)));
});

export const supportsInterfaces = Effect.fn("supportsInterfaces")(function* <
  const Interfaces extends Readonly<Record<string, Hex>>,
>(address: Address, interfaces: Interfaces) {
  const entries = Object.entries(interfaces) as unknown as ReadonlyArray<
    readonly [keyof Interfaces, Interfaces[keyof Interfaces]]
  >;

  const support = yield* Effect.all(
    entries.map(([key, interfaceId]) =>
      supportsInterface(address, interfaceId).pipe(
        Effect.map((supported) => [key, supported] as const),
      ),
    ),
    { concurrency: "unbounded" },
  );

  return Object.fromEntries(support) as { readonly [Key in keyof Interfaces]: boolean };
});
