import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { getAddress, slice, type Address } from "viem";

import { Live, onLive } from "../support/live.ts";

describe("proxies", () => {
  for (const network of ["mainnet", "sepolia"] as const) {
    onLive(network)(network, (it) => {
      it.effect("delegate to the implementations the deployment records", () =>
        Effect.gen(function* () {
          const live = yield* Live;
          const { contracts, implementations } =
            network === "mainnet" ? Deployments.mainnet.v2 : Deployments.sepolia.v2;

          for (const key of ["universalResolver", "contractNamer"] as const) {
            // Follows EIP-1967 implementation slots to the end: the Universal Resolver sits
            // behind two proxies.
            let address: Address = contracts[key];
            for (;;) {
              const slot = yield* live.storageAt(
                address,
                "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
              );
              if (BigInt(slot) === 0n) break;
              address = getAddress(slice(slot, 12));
            }
            assert.strictEqual(address, implementations[key], key);
          }
        }),
      );
    });
  }
});
