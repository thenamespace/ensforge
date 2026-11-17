import { describe, expectTypeOf, it } from "@effect/vitest";
import type { Effect } from "effect";

import { Actions, type EnsActions, type Plan, type Write } from "@ensforge/sdk";
import { Actions as EffectActions } from "@ensforge/sdk/effect";

type Equals<a, b> =
  (<t>() => t extends a ? 1 : 2) extends <t>() => t extends b ? 1 : 2 ? true : false;

type Standalone = typeof Actions;
type EffectEntry = typeof EffectActions;
type Groups = Exclude<keyof EnsActions, "batch">;

// Bound actions whose options or result differ from the standalone action with a client.
type BoundMismatches = {
  [group in Groups]: {
    [action in keyof EnsActions[group]]: action extends keyof Standalone[group]
      ? EnsActions[group][action] extends (options: infer options) => infer result
        ? Standalone[group][action] extends (client: never, options: infer expected) => infer value
          ? Equals<[options, result], [expected, value]> extends true
            ? never
            : `${group}.${action & string}`
          : `${group}.${action & string}`
        : `${group}.${action & string}`
      : `${group}.${action & string}`;
  }[keyof EnsActions[group]];
}[Groups];

// Effect actions whose success type differs from the Promise action's resolved value.
type EffectMismatches = {
  [group in Exclude<keyof Standalone, "batch">]: {
    [action in keyof Standalone[group]]: action extends keyof EffectEntry[group]
      ? Standalone[group][action] extends (...args: never) => Promise<infer value>
        ? EffectEntry[group][action] extends (
            ...args: never
          ) => Effect.Effect<infer success, infer _error, infer _requirements>
          ? Equals<value, success> extends true
            ? never
            : `${group}.${action & string}`
          : `${group}.${action & string}`
        : `${group}.${action & string}`
      : `${group}.${action & string}`;
  }[keyof Standalone[group]];
}[Exclude<keyof Standalone, "batch">];

describe("bound and standalone actions", () => {
  it("bound actions take the standalone options and return the same Promise", () => {
    expectTypeOf<BoundMismatches>().toEqualTypeOf<never>();
  });

  it("Effect actions succeed with the Promise action's value", () => {
    expectTypeOf<EffectMismatches>().toEqualTypeOf<never>();
  });

  it("bound writes expose prepare, simulate and estimateGas over the same options", () => {
    type Set = EnsActions["record"]["set"];

    expectTypeOf<Parameters<Set["prepare"]>[0]>().toEqualTypeOf<
      Parameters<typeof Actions.record.set.prepare>[1]
    >();
    expectTypeOf<ReturnType<Set["prepare"]>>().toEqualTypeOf<Promise<Plan>>();
    expectTypeOf<ReturnType<Set["simulate"]>>().toEqualTypeOf<Promise<Plan.Simulation>>();
    expectTypeOf<ReturnType<Set["estimateGas"]>>().toEqualTypeOf<Promise<Plan.Estimate>>();
  });
});

declare const ens: EnsActions;

describe("Write.Via", () => {
  const via: Write.Via = {
    id: "test",
    prepare: async (plan) => plan,
    send: async () => "reference",
    status: async () => ({ status: "pending" }),
  };

  it("is accepted by writes and their methods", () => {
    expectTypeOf(ens.record.set).toBeCallableWith({ name: "a.eth", texts: { url: null }, via });
    expectTypeOf(ens.record.set.prepare).toBeCallableWith({ name: "a.eth", via });
    expectTypeOf(ens.name.transfer.simulate).toBeCallableWith({
      name: "a.eth",
      to: "0x0000000000000000000000000000000000000001",
      via,
    });
    expectTypeOf(Actions.record.set.estimateGas).parameter(1).toMatchTypeOf<{
      via?: Write.Via | undefined;
    }>();
    expectTypeOf(EffectActions.record.set.prepare).parameter(1).toMatchTypeOf<{
      via?: Write.Via | undefined;
    }>();
  });

  it("is not an option of reads", () => {
    // @ts-expect-error reads have no `via`
    ens.record.getText({ name: "a.eth", key: "url", via });
  });
});

describe("Actions.x.y.request", () => {
  it("takes no options when the action's options are optional", () => {
    Actions.indexer.getStatus.request();
    // @ts-expect-error required options stay required
    Actions.record.getText.request();
  });
});
