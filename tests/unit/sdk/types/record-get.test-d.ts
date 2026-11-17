import { describe, expectTypeOf, it } from "@effect/vitest";
import type { Effect } from "effect";

import { Actions, type EnsActions } from "@ensforge/sdk";
import { Actions as EffectActions, type Ensforge } from "@ensforge/sdk/effect";
import type { Address, Hex } from "viem";

declare const ens: EnsActions;
declare const client: Ensforge.Client;

describe("record.get narrowing", () => {
  it("has exactly the selected text keys", async () => {
    const records = await ens.record.get({ name: "nick.eth", texts: ["url", "avatar"] });

    expectTypeOf(records.texts).toEqualTypeOf<{
      readonly url: string | null;
      readonly avatar: string | null;
    }>();
    expectTypeOf(records.resolver).toEqualTypeOf<Address | null>();
    expectTypeOf(records).not.toHaveProperty("addresses");
    expectTypeOf(records).not.toHaveProperty("contentHash");
  });

  it("types eth addresses as Address and other coins as strings", async () => {
    const records = await ens.record.get({ name: "nick.eth", addresses: ["eth", "btc", 60n] });

    expectTypeOf(records.addresses.eth).toEqualTypeOf<Address | null>();
    expectTypeOf(records.addresses.btc).toEqualTypeOf<string | null>();
    expectTypeOf(records.addresses["60"]).toEqualTypeOf<Address | null>();
    expectTypeOf(records).not.toHaveProperty("texts");
  });

  it("adds flag fields only when selected", async () => {
    const records = await ens.record.get({
      name: "nick.eth",
      contentHash: true,
      nameRecord: true,
      data: ["key"],
    });

    expectTypeOf(records).toHaveProperty("contentHash");
    expectTypeOf(records.nameRecord).toEqualTypeOf<string | null>();
    expectTypeOf(records.data).toEqualTypeOf<{ readonly key: Hex | null }>();
    expectTypeOf(records).not.toHaveProperty("pubkey");
    expectTypeOf(records).not.toHaveProperty("abi");
  });

  it("narrows the same way standalone and in Effect", () => {
    const promise = Actions.record.get(client, { name: "nick.eth", texts: ["url"] });
    const effect = EffectActions.record.get(client, { name: "nick.eth", texts: ["url"] });

    expectTypeOf(promise).resolves.toHaveProperty("texts").toEqualTypeOf<{
      readonly url: string | null;
    }>();
    expectTypeOf<Effect.Success<typeof effect>["texts"]>().toEqualTypeOf<{
      readonly url: string | null;
    }>();
  });

  it("narrows record.getAddress by coin", async () => {
    expectTypeOf(await ens.record.getAddress({ name: "nick.eth" })).toEqualTypeOf<Address | null>();
    expectTypeOf(await ens.record.getAddress({ name: "nick.eth", coin: "btc" })).toEqualTypeOf<
      string | null
    >();
  });
});
