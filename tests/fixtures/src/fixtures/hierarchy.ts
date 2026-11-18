import { Array as Arr, Effect, String as Str } from "effect";

import { CurrentStep } from "@ensforge/test-devnet";
import { keccak256, labelhash, namehash, type Hex } from "viem";

import { expectState } from "../builders/check.ts";
import { hashedSubname, registerV1, v1Subname } from "../builders/v1.ts";
import type { Fixture } from "../fixture.ts";
import { durations } from "./durations.ts";

const parent = "v1-hierarchy.eth";

// One registered parent for every hierarchy fixture, created by the first of them.
const ensureParent = Effect.gen(function* () {
  const c = yield* CurrentStep;
  const owner = yield* c.read("v1.registry", "owner", [namehash(parent)]);
  if (owner !== c.accounts.alice) {
    yield* registerV1({
      label: "v1-hierarchy",
      owner: c.accounts.alice,
      duration: durations.active,
    });
  }
});

const hashed = (
  id: string,
  cases: readonly string[],
  tags: Record<string, string>,
  hash: Hex,
  literal: string,
): Fixture => ({
  id,
  cases,
  tags: { kind: "v1-unwrapped", ...tags },
  prelaunch: (c) =>
    Effect.gen(function* () {
      yield* ensureParent;
      const sub = yield* hashedSubname({
        parent,
        labelhash: hash,
        parentOwner: c.accounts.alice,
        owner: c.accounts.bob,
      });
      return { name: sub.name, label: literal, owner: c.accounts.bob };
    }),
  check: (c, facts) =>
    Effect.gen(function* () {
      const owner = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
      yield* expectState(id, "owner", owner, c.accounts.bob);
    }),
});

/** Label shapes and depths that only exist on chain by hash, or stress encoding. */
export const hierarchy: readonly Fixture[] = [
  ...Arr.map(
    [
      ["hierarchy.label-63", Str.repeat(63)("a"), ["H02"]],
      ["hierarchy.label-64", Str.repeat(64)("b"), ["H02"]],
      ["hierarchy.label-255", Str.repeat(255)("c"), ["H01"]],
    ] as const,
    ([id, label, cases]): Fixture => ({
      id,
      cases,
      tags: { kind: "v1-unwrapped", label: `${label.length}-bytes` },
      prelaunch: (c) =>
        Effect.gen(function* () {
          yield* ensureParent;
          const sub = yield* v1Subname({
            parent,
            label,
            parentOwner: c.accounts.alice,
            owner: c.accounts.bob,
          });
          return { name: sub.name, owner: c.accounts.bob };
        }),
      check: (c, facts) =>
        Effect.gen(function* () {
          const owner = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
          yield* expectState(id, "owner", owner, c.accounts.bob);
        }),
    }),
  ),
  // A mainnet-style name registered as one label containing a dot, e.g. `8436.eth` as one label.
  hashed(
    "hierarchy.label-with-dot",
    ["H04"],
    { label: "contains-dot" },
    labelhash("8436.x"),
    "8436.x",
  ),
  hashed(
    "hierarchy.label-literal-hex",
    ["H05"],
    { label: "literal-encoded" },
    labelhash(`[${Str.repeat(32)("ab")}]`),
    `[${Str.repeat(32)("ab")}]`,
  ),
  hashed(
    "hierarchy.label-invalid-utf8",
    ["H06"],
    { label: "invalid-utf8" },
    keccak256("0xff"),
    "0xff",
  ),
  hashed(
    "hierarchy.label-unknown",
    ["M:C6", "H10"],
    { label: "unknown" },
    labelhash("never revealed by ensforge"),
    "",
  ),
  // On chain by hash, but not normalized: readable only by node.
  hashed(
    "hierarchy.label-unnormalized",
    ["L32", "M:C8"],
    { label: "unnormalized" },
    labelhash("Nick"),
    "Nick",
  ),
  {
    id: "hierarchy.depth-33",
    cases: ["H13"],
    tags: { kind: "v1-unwrapped", depth: "35" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        yield* ensureParent;
        let current = parent;
        for (let level = 1; level <= 33; level++) {
          const sub = yield* v1Subname({
            parent: current,
            label: `l${level}`,
            parentOwner: c.accounts.alice,
            owner: c.accounts.alice,
          });
          current = sub.name;
        }
        return { name: current, owner: c.accounts.alice, labels: Str.split(current, ".").length };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
        yield* expectState("hierarchy.depth-33", "owner", owner, c.accounts.alice);
      }),
  },
];
