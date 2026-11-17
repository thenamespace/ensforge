import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { parseAbi } from "viem";

import { Chain, Devnet, profileNames, verify } from "../../src/index.ts";

describe("verify", () => {
  for (const profile of profileNames) {
    layer(Devnet.layer({ profile }), { excludeTestServices: true })(profile, (it) => {
      it.effect("finds the profile wired as intended", () =>
        Effect.gen(function* () {
          const problems = yield* verify();
          assert.deepStrictEqual(problems, []);
        }).pipe(Effect.provide(NodeServices.layer)),
      );
    });
  }

  layer(Chain.layer.pipe(Layer.provideMerge(Devnet.layer({ profile: "v1-live" }))), {
    excludeTestServices: true,
  })("tampered", (it) => {
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
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });
});
