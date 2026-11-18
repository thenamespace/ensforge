import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { Chain, Devnet } from "@ensforge/test-devnet";
import { namehash, type Address } from "viem";

import { onFork } from "../support/fork.ts";

// A public resolver checks writes against the registry it was built with. ensforge reports the
// deployment's `legacyPublicResolvers` as writable by the name's owner and `frozenPublicResolvers`
// (bound to the 2017 registry) as read-only: the current registry's owner of `eth`, the .eth
// registrar, must be able to write on the first and not on the second.

describe("legacy public resolvers", () => {
  for (const network of ["mainnet", "sepolia"] as const) {
    onFork(network)(network, (it) => {
      it.effect(
        "accept writes from the current registry's owner, unless frozen",
        () =>
          Effect.gen(function* () {
            const { deployments } = yield* Devnet;
            const chain = yield* Chain;
            const v1 = deployments.v1 ?? assert.fail(`${network} has no ENSv1 deployment`);
            const owner = v1.contracts.baseRegistrar;
            yield* chain.impersonate(owner);
            yield* chain.setBalance(owner, 10n ** 18n);

            const writes = (resolver: Address) =>
              chain
                .simulate({
                  address: resolver,
                  abi: Abis.v1.publicResolver,
                  functionName: "setText",
                  args: [namehash("eth"), "url", "https://ensforge.test"],
                  account: owner,
                })
                .pipe(
                  Effect.as(true),
                  Effect.catchTag("ChainError", () => Effect.succeed(false)),
                );

            for (const resolver of v1.legacyPublicResolvers ?? []) {
              const writable = yield* writes(resolver);
              assert.isTrue(writable, `${network} ${resolver} should be writable`);
            }
            for (const resolver of v1.frozenPublicResolvers ?? []) {
              const writable = yield* writes(resolver);
              assert.isFalse(writable, `${network} ${resolver} should be frozen`);
            }
          }),
        { meta: { cases: ["M:B2"] } },
      );
    });
  }
});
