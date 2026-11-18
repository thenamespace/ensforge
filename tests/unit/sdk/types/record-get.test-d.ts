import { describe, expectTypeOf, it } from "@effect/vitest";
import type { Effect } from "effect";

import { Actions, type EnsActions } from "@ensforge/sdk";
import { Actions as EffectActions, type Ensforge } from "@ensforge/sdk/effect";
import type { Address, Hex } from "viem";

declare const ens: EnsActions;
declare const client: Ensforge.Client;

describe("record.get narrowing", () => {
  it("has exactly the selected text keys", () => {
    const promise = ens.record.get({ name: "nick.eth", texts: ["url", "avatar"] });
    type Records = Awaited<typeof promise>;

    expectTypeOf<Records["texts"]>().toEqualTypeOf<{
      readonly url: string | null;
      readonly avatar: string | null;
    }>();
    expectTypeOf<Records["resolver"]>().toEqualTypeOf<Address | null>();
    expectTypeOf<Records>().not.toHaveProperty("addresses");
    expectTypeOf<Records>().not.toHaveProperty("contentHash");
  });

  it("types eth addresses as Address and other coins as strings", () => {
    const promise = ens.record.get({ name: "nick.eth", addresses: ["eth", "btc", 60n] });
    type Records = Awaited<typeof promise>;

    expectTypeOf<Records["addresses"]["eth"]>().toEqualTypeOf<Address | null>();
    expectTypeOf<Records["addresses"]["btc"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Records["addresses"]["60"]>().toEqualTypeOf<Address | null>();
    expectTypeOf<Records>().not.toHaveProperty("texts");
  });

  it("adds flag fields only when selected", () => {
    const promise = ens.record.get({
      name: "nick.eth",
      contentHash: true,
      nameRecord: true,
      data: ["key"],
    });
    type Records = Awaited<typeof promise>;

    expectTypeOf<Records>().toHaveProperty("contentHash");
    expectTypeOf<Records["nameRecord"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Records["data"]>().toEqualTypeOf<{ readonly key: Hex | null }>();
    expectTypeOf<Records>().not.toHaveProperty("pubkey");
    expectTypeOf<Records>().not.toHaveProperty("abi");
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

  it("narrows record.getAddress by coin", () => {
    expectTypeOf(
      ens.record.getAddress({ name: "nick.eth" }),
    ).resolves.toEqualTypeOf<Address | null>();
    expectTypeOf(ens.record.getAddress({ name: "nick.eth", coin: "btc" })).resolves.toEqualTypeOf<
      string | null
    >();
  });
});
