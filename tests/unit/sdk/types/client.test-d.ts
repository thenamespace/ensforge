import { describe, expectTypeOf, it } from "@effect/vitest";

import {
  Ensforge,
  ensActions,
  recordActions,
  type EnsActions,
  type RecordActions,
} from "@ensforge/sdk";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  custom,
  http,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
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
  it("takes transports, any viem wallet or a getter, and a local account", () => {
    const transport = http();
    const walletClient = createWalletClient({ chain: mainnet, transport, account: zeroAddress });
    const testClient = createTestClient({ chain: mainnet, mode: "anvil", transport });

    expectTypeOf(Ensforge.create({ chain: mainnet })).toEqualTypeOf<Ensforge.Client>();
    Ensforge.create({
      chain: mainnet,
      transports: { [mainnet.id]: transport, [optimism.id]: custom(testClient) },
      wallet: walletClient,
    });
    Ensforge.create({
      chain: mainnet,
      wallet: (chainId) => createWalletClient({ chain: { ...mainnet, id: chainId }, transport }),
      switchChain: false,
    });
    Ensforge.create({ chain: mainnet, wallet: testClient });
    Ensforge.create({
      chain: mainnet,
      account: privateKeyToAccount(zeroHash),
      pollingInterval: 50,
    });
    expectTypeOf(
      Ensforge.from(createPublicClient({ chain: mainnet, transport })),
    ).toEqualTypeOf<Ensforge.Client>();
    // Every chain's viem client stays reachable.
    expectTypeOf<Ensforge.Client["client"]>().toEqualTypeOf<
      (chainId?: number) => Ensforge.ViemClient
    >();
  });
});
