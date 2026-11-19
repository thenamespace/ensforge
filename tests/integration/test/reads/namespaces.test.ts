import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer, String as Str } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";

import { Clients } from "../support/clients.ts";
import { Gateways } from "../support/gateways.ts";
import { chainServices } from "../support/lane.ts";
import { Namespaces, offchainAddress } from "../support/namespaces.ts";

// L2 namespaces on Ethereum: each family's parent resolves its names through its gateway, which
// answers from the L2's state. ensforge reads these names on their L2 itself in later phases; this
// is the path every client already takes.

const services = Namespaces.layer.pipe(
  Layer.provideMerge(chainServices),
  Layer.provideMerge(Fixtures.layer({ profile: "mainnet-shaped" })),
);

describe("L2 namespace names on Ethereum", () => {
  layer(services, { excludeTestServices: true })("mainnet-shaped", (it) => {
    it.effect("resolve through each family's gateway from the L2's records", () =>
      Effect.gen(function* () {
        const namespaces = yield* Namespaces;
        const ens = (yield* Clients).make(namespaces.clientOptions());
        const names = [
          ...namespaces.fixtures["l2-base"].where({ kind: "l2-name", state: "active" }),
          ...namespaces.fixtures["l2-base"].where({ kind: "l2-name", state: "subname" }),
          ...namespaces.fixtures["l2-optimism"].all,
          ...namespaces.fixtures["l2-linea"].where({ state: "active" }),
          ...namespaces.fixtures["l2-linea"].where({ state: "subname" }),
          ...namespaces.fixtures["l2-celo"].where({ state: "active" }),
        ];
        assert.lengthOf(names, 11);

        for (const { name, facts } of names) {
          const address = yield* Actions.record.getAddress(ens, { name });
          const url = yield* Actions.record.getText(ens, { name, key: "url" });
          assert.strictEqual(address, facts["owner"], name);
          assert.strictEqual(url, `https://ensforge.com/${name}`, name);
        }
      }),
    );

    it.effect(
      "resolves a Namespace off-chain parent's names from its database",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const ens = (yield* Clients).make(namespaces.clientOptions());
          const address = yield* Actions.record.getAddress(ens, {
            name: "anyone.ns-offchain.eth",
          });
          assert.strictEqual(address, offchainAddress);
        }),
      { meta: { cases: ["N16"] } },
    );

    it.effect(
      "fails with a typed error when a family's gateway fails or signs with another key",
      () =>
        Effect.gen(function* () {
          const namespaces = yield* Namespaces;
          const gateways = yield* Gateways;
          const ens = (yield* Clients).make(namespaces.clientOptions());
          const name = namespaces.fixtures["l2-base"].byId("namespaces.basenames.active").name;
          const failing = yield* gateways.serve(() => ({ status: 500, body: "{}" }));
          const forged = yield* gateways.serveLookups(() =>
            Effect.succeed(
              // An answer the resolver's signer never signed, expired long ago.
              `0x${Str.repeat(32 * 6)("00")}` as const,
            ),
          );

          yield* namespaces.isolated(
            Effect.gen(function* () {
              yield* namespaces.pointAt("basenames", failing.url);
              yield* expectFailure(Actions.record.getAddress(ens, { name }), {
                _tag: "GatewayError",
                code: "GATEWAY_REQUEST_FAILED",
              });

              yield* namespaces.pointAt("basenames", forged.url);
              yield* expectFailure(Actions.record.getAddress(ens, { name }), {
                _tag: "GatewayError",
                code: "GATEWAY_RESPONSE_INVALID",
              });
            }),
          );
        }),
      { meta: { cases: ["N19"] } },
    );
  });
});
