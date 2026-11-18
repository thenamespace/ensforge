import { assert, describe } from "@effect/vitest";
import { Array as Arr, Effect, Predicate, Record as Rec } from "effect";

import { Chain, Devnet } from "@ensforge/test-devnet";
import { isAddress, type Address } from "viem";

import { onFork } from "../support/fork.ts";

// The deployment profiles ensforge ships name real contracts: every address in them has code on
// the network at the pinned block.

describe("deployment profiles", () => {
  for (const network of ["mainnet", "sepolia"] as const) {
    onFork(network)(network, (it) => {
      it.effect("name a contract at every address", () =>
        Effect.gen(function* () {
          const { deployments } = yield* Devnet;
          const chain = yield* Chain;

          // Every address in the profile, with the path it sits at.
          const addresses: (readonly [string, Address])[] = [];
          const walk = (value: unknown, path: string): void => {
            if (Predicate.isString(value) && isAddress(value, { strict: false })) {
              addresses.push([path, value]);
            } else if (Arr.isArray(value)) {
              Arr.forEach(value, (entry, index) => walk(entry, `${path}[${index}]`));
            } else if (Predicate.isObject(value)) {
              for (const [key, entry] of Rec.toEntries(value)) walk(entry, `${path}.${key}`);
            }
          };
          walk(deployments, network);

          const missing: string[] = [];
          for (const [path, address] of addresses) {
            const code = yield* chain.code(address);
            if (code === undefined || code === "0x") missing.push(`${path} ${address}`);
          }

          assert.isAbove(addresses.length, 30);
          assert.deepStrictEqual(missing, []);
        }),
      );
    });
  }
});
