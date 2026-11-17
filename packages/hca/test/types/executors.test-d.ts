import { describe, expectTypeOf, it } from "@effect/vitest";

import type { Write } from "@ensforge/sdk";

import { defineExecutor } from "#/executors/define";
import { hca } from "#/hca";
import type { Executor } from "#/types";

describe("executor types", () => {
  it("hca() is a write route", () => {
    expectTypeOf(hca()).toEqualTypeOf<Write.Via>();
  });

  it("an executor must declare every capability", () => {
    // @ts-expect-error: `deploys` is missing
    defineExecutor({ id: "x", capabilities: { sessions: false, sponsorship: false } });
    expectTypeOf(defineExecutor).returns.toEqualTypeOf<Executor>();
  });

  it("send resolves to a reference string", () => {
    expectTypeOf<NonNullable<Executor["send"]>>().returns.toEqualTypeOf<Promise<string>>();
  });
});
