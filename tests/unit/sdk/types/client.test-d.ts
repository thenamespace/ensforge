import { describe, expectTypeOf, it } from "@effect/vitest";

import {
  Ensforge,
  ensActions,
  recordActions,
  type EnsActions,
  type RecordActions,
} from "@ensforge/sdk";
import {
  createClient,
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  zeroAddress,
} from "viem";
import { mainnet, optimism } from "viem/chains";

declare const base: Ensforge.Client;

describe("Client.extend", () => {
  it("adds the decorator's groups to the client type", () => {
    const ens = base.extend(recordActions());

    expectTypeOf(ens).toEqualTypeOf<Ensforge.Client<RecordActions>>();
    expectTypeOf(ens.record.getText).toEqualTypeOf<RecordActions["record"]["getText"]>();
    expectTypeOf(ens.chain).toEqualTypeOf<{ readonly id: number; readonly name: string }>();
  });

  it("composes successive extends", () => {
    const ens = base
      .extend(() => ({ one: { value: () => 1 } }))
      .extend((client) => ({ two: { value: () => client.one.value() + 1 } }));

    // `const` inference keeps the literal return type of added actions.
    expectTypeOf(ens.one.value).returns.toEqualTypeOf<1>();
    expectTypeOf(ens.two.value).returns.toEqualTypeOf<number>();
    // The decorator sees the groups added before it.
    base
      .extend(() => ({ one: {} }))
      .extend((client) => {
        expectTypeOf(client.one).toEqualTypeOf<{}>();
        return {};
      });
  });

  it("keeps literal types of added groups", () => {
    const ens = base.extend(() => ({ meta: { tag: "ens" } }));
    expectTypeOf(ens.meta.tag).toEqualTypeOf<"ens">();
  });

  it("types ensActions as every bound group", () => {
    const ens = base.extend(ensActions());

    expectTypeOf(ens).toMatchTypeOf<EnsActions>();
    expectTypeOf(ens).not.toHaveProperty("indexer");
    expectTypeOf(base).not.toHaveProperty("record");
  });

  it("accepts any extended client where a client is expected", () => {
    expectTypeOf(base.extend(ensActions())).toMatchTypeOf<Ensforge.Like>();
    expectTypeOf(Ensforge.from).returns.toEqualTypeOf<Ensforge.Client>();
  });
});

describe("Ensforge.create", () => {
  it("accepts every kind of viem client, created inline or not", () => {
    const transport = http();
    const publicClient = createPublicClient({ chain: mainnet, transport });
    const walletClient = createWalletClient({ chain: mainnet, transport, account: zeroAddress });
    const testClient = createTestClient({ chain: mainnet, mode: "anvil", transport });

    expectTypeOf(Ensforge.create({ publicClient, walletClient })).toEqualTypeOf<Ensforge.Client>();
    Ensforge.create({
      publicClient: createPublicClient({ chain: mainnet, transport }),
      walletClient: () => createWalletClient({ chain: mainnet, transport }),
      chains: { 10: { publicClient: createClient({ chain: optimism, transport }) } },
    });
    Ensforge.create({ publicClient: testClient });
    expectTypeOf(Ensforge.from(publicClient)).toEqualTypeOf<Ensforge.Client>();
    // The client keeps exposing the full viem client.
    expectTypeOf<Ensforge.Client["publicClient"]>().toEqualTypeOf<Ensforge.ViemClient>();
  });
});
