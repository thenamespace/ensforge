import { Effect } from "effect";

import type { StepContext } from "@ensforge/test-devnet";
import { keccak256, labelhash, namehash, type Hex } from "viem";

import { expectState } from "../builders/check.ts";
import { hashedSubname, registerV1, v1Subname } from "../builders/v1.ts";
import type { Fixture } from "../fixture.ts";
import { durations } from "./durations.ts";

const parent = "v1-hierarchy.eth";

// One registered parent for every hierarchy fixture, created by the first of them.
const ensureParent = (c: StepContext) =>
  Effect.gen(function* () {
    const owner = yield* c.read("v1.registry", "owner", [namehash(parent)]);
    if (owner !== c.accounts.alice) {
      yield* registerV1(c, {
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
  label: () => Hex,
  literal: string,
): Fixture => ({
  id,
  cases,
  tags: { kind: "v1-unwrapped", ...tags },
  prelaunch: (c) =>
    Effect.gen(function* () {
      yield* ensureParent(c);
      const sub = yield* hashedSubname(c, {
        parent,
        labelhash: label(),
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

const literalHexLabel = `[${"ab".repeat(32)}]`;

/** Label shapes and depths that only exist on chain by hash, or stress encoding. */
export const hierarchy: readonly Fixture[] = [
  ...(
    [
      ["hierarchy.label-63", "a".repeat(63), ["H02"]],
      ["hierarchy.label-64", "b".repeat(64), ["H02"]],
      ["hierarchy.label-255", "c".repeat(255), ["H01"]],
    ] as const
  ).map(([id, label, cases]): Fixture => ({
    id,
    cases,
    tags: { kind: "v1-unwrapped", label: `${label.length}-bytes` },
    prelaunch: (c) =>
      Effect.gen(function* () {
        yield* ensureParent(c);
        const sub = yield* v1Subname(c, {
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
  })),
  // A mainnet-style name registered as one label containing a dot, e.g. `8436.eth` as one label.
  hashed(
    "hierarchy.label-with-dot",
    ["H04"],
    { label: "contains-dot" },
    () => labelhash("8436.x"),
    "8436.x",
  ),
  hashed(
    "hierarchy.label-literal-hex",
    ["H05"],
    { label: "literal-encoded" },
    () => labelhash(literalHexLabel),
    literalHexLabel,
  ),
  hashed(
    "hierarchy.label-invalid-utf8",
    ["H06"],
    { label: "invalid-utf8" },
    () => keccak256("0xff"),
    "0xff",
  ),
  hashed(
    "hierarchy.label-unknown",
    ["M:C6", "H10"],
    { label: "unknown" },
    () => labelhash("never revealed by ensforge"),
    "",
  ),
  // On chain by hash, but not normalized: readable only by node.
  hashed(
    "hierarchy.label-unnormalized",
    ["L32", "M:C8"],
    { label: "unnormalized" },
    () => labelhash("Nick"),
    "Nick",
  ),
  {
    id: "hierarchy.depth-33",
    cases: ["H13"],
    tags: { kind: "v1-unwrapped", depth: "35" },
    prelaunch: (c) =>
      Effect.gen(function* () {
        yield* ensureParent(c);
        let current = parent;
        for (let level = 1; level <= 33; level++) {
          const sub = yield* v1Subname(c, {
            parent: current,
            label: `l${level}`,
            parentOwner: c.accounts.alice,
            owner: c.accounts.alice,
          });
          current = sub.name;
        }
        return { name: current, owner: c.accounts.alice, labels: current.split(".").length };
      }),
    check: (c, facts) =>
      Effect.gen(function* () {
        const owner = yield* c.read("v1.registry", "owner", [namehash(String(facts["name"]))]);
        yield* expectState("hierarchy.depth-33", "owner", owner, c.accounts.alice);
      }),
  },
];
