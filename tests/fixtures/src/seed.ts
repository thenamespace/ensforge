import { createHash } from "node:crypto";

import { Effect, FileSystem, Path } from "effect";

import { step, type ProfileName, type Seed, type Step } from "@ensforge/test-devnet";
import { namehash } from "viem";

import { clockJump, seededOn, type Facts, type Manifest } from "./fixture.ts";
import { allFixtures } from "./fixtures/index.ts";
import { premigration } from "./premigration.ts";

/**
 * The fixtures seeded on `profile` as a devnet seed: prelaunch phases before the ENSv2 launch
 * (then, on `mainnet-shaped`, the premigration), postlaunch phases, one clock jump, the
 * `afterTime` phases, then every self-check.
 */
export const fixtureSeed = (profile: ProfileName, key: string): Seed => ({
  key: `${profile}:${key}`,
  create: () => {
    const selected = allFixtures.filter((fixture) => seededOn(fixture, profile));
    const facts = new Map<string, Facts>();
    let jumpedAt = 0n;

    const phase = (name: "prelaunch" | "postlaunch" | "afterTime"): Step[] =>
      selected.flatMap((fixture) => {
        const run = fixture[name];
        if (run === undefined) return [];
        return [
          step(`fixture ${fixture.id} (${name})`, (c) =>
            run(c, facts.get(fixture.id) ?? {}).pipe(
              Effect.map((found) => {
                // bigints become decimal strings, so the manifest is plain JSON.
                const recorded = Object.fromEntries(
                  Object.entries(found).map(([field, value]) => [
                    field,
                    typeof value === "bigint" ? value.toString() : value,
                  ]),
                );
                facts.set(fixture.id, { ...facts.get(fixture.id), ...recorded });
              }),
            ),
          ),
        ];
      });

    return {
      prelaunch: [
        ...phase("prelaunch"),
        ...(profile === "mainnet-shaped" ? [premigration(selected, facts)] : []),
      ],
      postlaunch: [
        ...phase("postlaunch"),
        step("fixtures clock jump", (c) =>
          Effect.gen(function* () {
            c.time.advance(clockJump);
            jumpedAt = c.time.now();
            yield* c.cheat(async (client) => {
              await client.setNextBlockTimestamp({ timestamp: jumpedAt });
              await client.mine({ blocks: 1 });
            });
          }),
        ),
        ...phase("afterTime"),
        ...selected.map((fixture) =>
          step(`fixture ${fixture.id} (check)`, (c) =>
            fixture.check(c, facts.get(fixture.id) ?? {}),
          ),
        ),
      ],
      output: (): Manifest => ({
        profile,
        clock: { jumpedAt: jumpedAt.toString(), jump: clockJump.toString() },
        fixtures: selected.map((fixture) => {
          const found = facts.get(fixture.id) ?? {};
          const name = String(found["name"]);
          return {
            id: fixture.id,
            name,
            node: namehash(name),
            tags: fixture.tags,
            cases: fixture.cases,
            facts: found,
          };
        }),
      }),
    };
  },
});

/** Hash of this package's sources: a fixture build is stale when they change. */
export const sourcesKey = Effect.fn("sourcesKey")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const src = path.join(new URL("..", import.meta.url).pathname, "src");
  const hash = createHash("sha256");
  for (const file of (yield* fs.readDirectory(src, { recursive: true })).toSorted()) {
    if (!file.endsWith(".ts")) continue;
    hash.update(file).update(yield* fs.readFileString(path.join(src, file)));
  }
  return hash.digest("hex").slice(0, 16);
});
