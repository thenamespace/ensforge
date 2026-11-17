import { describe, expectTypeOf, it } from "@effect/vitest";

import { defineExecutor } from "@ensforge/hca/internal/executors/define";
import { hca } from "@ensforge/hca/internal/hca";
import type { Executor } from "@ensforge/hca/internal/types";
import type { Write } from "@ensforge/sdk";

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
