import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { parseAbi } from "viem";

import {
  Anvil,
  Chain,
  Devnet,
  l2ProfileNames,
  profileNames,
  startL2,
  verify,
  verifyL2,
} from "../../src/index.ts";

describe("verify", () => {
  for (const profile of profileNames) {
    layer(Layer.mergeAll(Devnet.layer({ profile }), NodeServices.layer), {
      excludeTestServices: true,
    })(profile, (it) => {
      it.effect("finds the profile wired as intended", () =>
        Effect.gen(function* () {
          const problems = yield* verify();
          assert.deepStrictEqual(problems, []);
        }),
      );
    });
  }

  layer(Anvil.layer.pipe(Layer.provideMerge(NodeServices.layer)), {
    excludeTestServices: true,
  })("L2 profiles", (it) => {
    for (const profile of l2ProfileNames) {
      it.effect(`finds ${profile} wired as intended`, () =>
        Effect.gen(function* () {
          const problems = yield* startL2({ profile }).pipe(Effect.flatMap(verifyL2));
          assert.deepStrictEqual(problems, []);
        }).pipe(Effect.scoped),
      );
    }
  });

  layer(
    Chain.layer.pipe(
      Layer.provideMerge(Devnet.layer({ profile: "v1-live" })),
      Layer.provideMerge(NodeServices.layer),
    ),
    { excludeTestServices: true },
  )("tampered", (it) => {
    it.effect("reports altered code and a moved resolver", () =>
      Effect.gen(function* () {
        const { accounts, contract } = yield* Devnet;
        const chain = yield* Chain;
        yield* chain.setCode(contract("legacy.publicResolver2017"), "0x00");
        yield* chain.write({
          address: contract("v1.registrarSecurityController"),
          abi: parseAbi(["function setRegistrarResolver(address resolver)"]),
          functionName: "setRegistrarResolver",
          args: [accounts.user],
          account: accounts.owner,
        });

        const problems = yield* verify();
        assert.deepStrictEqual(problems, [
          "legacy.publicResolver2017: placed code differs from mainnet's",
          `eth resolver: ${accounts.user}, expected ${contract("v1.ethOwnedResolver")}`,
        ]);
      }),
    );
  });
});
