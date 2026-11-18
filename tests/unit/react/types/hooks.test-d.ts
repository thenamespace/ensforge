import { describe, expectTypeOf, it } from "@effect/vitest";

import { useRead, useRecords, useSignClaim, useWrite, useInfiniteRead } from "@ensforge/react";
import { Actions, type Errors, type Write } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";

describe("read hooks", () => {
  it("type data from the action's return type", () => {
    expectTypeOf(
      useRead(Actions.record.getText, { name: "nick.eth", key: "url" }).data,
    ).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(useRead(Actions.record.getText, undefined).error).toEqualTypeOf<
      Errors.AnyError | undefined
    >();
  });

  it("type errors from an Effect action's error channel", () => {
    const { error } = useRead(EffectActions.record.getText, { name: "nick.eth", key: "url" });
    expectTypeOf(error).toEqualTypeOf<EffectActions.record.getText.ErrorType | undefined>();
  });

  it("narrow records to the selection", () => {
    const { data } = useRecords({ name: "nick.eth", texts: ["url"] });
    expectTypeOf(data?.texts.url).toEqualTypeOf<string | null | undefined>();
  });

  it("type items of paginated lists", () => {
    const { items } = useInfiniteRead(Actions.indexer.getSubnames, { name: "ens.eth" });
    expectTypeOf(items[0]?.name).toEqualTypeOf<string | undefined>();
  });
});

describe("write hooks", () => {
  it("take the action's options and resolve with its result", () => {
    const { mutateAsync } = useWrite(Actions.record.set);
    expectTypeOf(mutateAsync).parameter(0).toHaveProperty("name");
    expectTypeOf(
      mutateAsync({ name: "alice.eth", texts: { url: "x" } }),
    ).resolves.toEqualTypeOf<Write.Result>();
    // @ts-expect-error a name is required
    void mutateAsync({ texts: { url: "x" } });
  });

  it("resolve signed claims with the claim and its signature", () => {
    const { mutateAsync } = useSignClaim();
    expectTypeOf(
      mutateAsync({ name: "alice.eth", chainIds: [10] }),
    ).resolves.toEqualTypeOf<Actions.primaryName.signClaim.ReturnType>();
  });
});
