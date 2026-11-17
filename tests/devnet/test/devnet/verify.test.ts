import { NodeServices } from "@effect/platform-node";
import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import { namehash, parseAbi, type Address } from "viem";

import { Devnet, profileNames } from "../../src/index.ts";
import { verify } from "../../src/verify.ts";

describe("verify", () => {
  for (const profile of profileNames) {
    layer(Devnet.layer({ profile }), { excludeTestServices: true })(profile, (it) => {
      it.effect("finds the profile wired as intended", () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const problems = yield* verify(devnet);
          assert.deepStrictEqual(problems, []);
        }).pipe(Effect.provide(NodeServices.layer)),
      );
    });
  }

  layer(Devnet.layer({ profile: "v1-live" }), { excludeTestServices: true })("tampered", (it) => {
    it.effect("reports altered code and a moved resolver", () =>
      Effect.gen(function* () {
        const devnet = yield* Devnet;
        const { client, contracts, accounts } = devnet;
        yield* Effect.promise(async () => {
          await client.setCode({
            address: contracts["legacy.publicResolver2017"] as Address,
            bytecode: "0x00",
          });
          await client.impersonateAccount({ address: contracts["v1.baseRegistrar"] as Address });
          await client.setBalance({
            address: contracts["v1.baseRegistrar"] as Address,
            value: 10n ** 18n,
          });
          const hash = await client.writeContract({
            address: contracts["v1.registry"] as Address,
            abi: parseAbi(["function setResolver(bytes32 node, address resolver)"]),
            functionName: "setResolver",
            args: [namehash("eth"), accounts.user],
            account: contracts["v1.baseRegistrar"] as Address,
            chain: null,
          });
          await client.waitForTransactionReceipt({ hash });
        });

        const problems = yield* verify(devnet);
        assert.deepStrictEqual(problems, [
          "legacy.publicResolver2017: placed code differs from mainnet's",
          `eth resolver: ${accounts.user}, expected ${contracts["v1.ethOwnedResolver"]}`,
        ]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });
});
