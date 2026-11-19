import { assert, describe, it } from "@effect/vitest";
import { Effect, Predicate, Record as Rec } from "effect";

import { Actions, Ensforge, ensActions } from "@ensforge/sdk";
import { Ensforge as EffectEnsforge } from "@ensforge/sdk/effect";
import { expectFailure, expectThrow, noRpc, scriptedTransport } from "@ensforge/test-harness";
import { createPublicClient, defineChain } from "viem";
import { mainnet } from "viem/chains";

/** Options for a mainnet client whose transport must not be asked anything. */
const offline = () => {
  const { transport } = scriptedTransport(noRpc);
  return { chain: mainnet, transports: { [mainnet.id]: transport }, publicRpc: false } as const;
};

describe("Client.extend", () => {
  it("returns a new client and leaves the original unchanged", () => {
    const base = Ensforge.create(offline());
    const extended = base.extend(() => ({ greet: { hello: () => "hi" } }));

    assert.notStrictEqual(extended, base);
    assert.strictEqual(extended.greet.hello(), "hi");
    assert.notProperty(base, "greet");
    assert.isTrue(Object.isFrozen(extended));
  });

  it("merges groups by key, later actions winning", () => {
    const ens = Ensforge.create(offline())
      .extend(() => ({ tools: { a: () => "first", b: () => "first" } }))
      .extend(() => ({ tools: { b: () => "second", c: () => "second" } }));

    assert.strictEqual(ens.tools.a(), "first");
    assert.strictEqual(ens.tools.b(), "second");
    assert.strictEqual(ens.tools.c(), "second");
    assert.isTrue(Object.isFrozen(ens.tools));
  });

  it("passes the current client, with earlier groups, to the decorator", () => {
    const ens = Ensforge.create(offline())
      .extend(() => ({ one: { value: () => 1 } }))
      .extend((client) => ({ two: { value: () => client.one.value() + 1 } }));

    assert.strictEqual(ens.two.value(), 2);
  });

  it.each(["chain", "account", "deployment", "client", "config", "extend"])(
    "rejects the reserved group %j",
    (group) => {
      const base = Ensforge.create(offline());

      expectThrow(() => base.extend(() => ({ [group]: {} })), {
        _tag: "ConfigError",
        code: "INVALID_ACTION_GROUP",
      });
    },
  );

  it("binds every action group of ensActions to the client", () => {
    const ens = Ensforge.create(offline()).extend(ensActions());

    for (const [domain, group] of Rec.toEntries(Actions)) {
      // The indexer group is added by `indexerActions` from `@ensforge/sdk/indexer`.
      if (domain === "indexer" || typeof group === "function") continue;
      const bound: unknown = Reflect.get(ens, domain);
      assert.isDefined(bound, domain);
      assert.sameMembers(
        Predicate.isObject(bound) ? Rec.keys(bound) : [],
        Rec.keys<string, unknown>(group),
        domain,
      );
    }
  });
});

describe("Ensforge.from and Ensforge.is", () => {
  it("wraps a bare viem client once, reading through it", () => {
    const { transport } = scriptedTransport(noRpc);
    const client = createPublicClient({ chain: mainnet, transport });

    const ens = Ensforge.from(client);

    assert.isTrue(Ensforge.is(ens));
    assert.strictEqual(ens.chain.id, mainnet.id);
    assert.strictEqual(Ensforge.from(client), ens);
  });

  it("fails with UNKNOWN_CHAIN for a bare client on an unknown chain", () => {
    const { transport } = scriptedTransport(noRpc);
    const chain = defineChain({
      id: 424242,
      name: "Unknown",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["http://localhost:8545"] } },
    });

    expectThrow(() => Ensforge.from(createPublicClient({ chain, transport })), {
      _tag: "ConfigError",
      code: "UNKNOWN_CHAIN",
    });
  });
});

describe("Ensforge.layer", () => {
  it.effect("provides the client as a service", () =>
    Effect.gen(function* () {
      const ens = yield* EffectEnsforge.Ensforge.pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test is the entry point
        Effect.provide(EffectEnsforge.layer(offline())),
      );

      assert.isTrue(EffectEnsforge.is(ens));
      assert.strictEqual(ens.chain.id, mainnet.id);
    }),
  );

  it.effect("fails with the ConfigError of create", () =>
    Effect.gen(function* () {
      const { transport } = scriptedTransport(noRpc);
      const chain = defineChain({
        id: 424242,
        name: "Unknown",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["http://localhost:8545"] } },
      });

      yield* expectFailure(
        EffectEnsforge.Ensforge.pipe(
          // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test is the entry point
          Effect.provide(
            EffectEnsforge.layer({
              chain,
              transports: { [chain.id]: transport },
              publicRpc: false,
            }),
          ),
        ),
        { _tag: "ConfigError", code: "UNKNOWN_CHAIN" },
      );
    }),
  );
});
