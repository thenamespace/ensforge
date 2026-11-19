import { Clock, Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { build, isL2Profile, type BuildName } from "../build.ts";
import { l2ProfileNames, l2Profiles, profileNames, profiles } from "../profiles/profiles.ts";

export const profileArgument = Argument.Literals("profile", profileNames).pipe(
  Argument.withDescription("Devnet profile"),
);

export const buildNames: readonly BuildName[] = [...profileNames, ...l2ProfileNames];

export const buildCommand = Command.make(
  "build",
  {
    profiles: Argument.Literals("profile", buildNames).pipe(
      Argument.withDescription("Devnet or L2 profile"),
      Argument.variadic(),
    ),
    force: Flag.Boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Rebuild even when a cached build matches"),
    ),
  },
  ({ profiles: selected, force }) =>
    Effect.forEach(
      selected.length > 0 ? selected : buildNames,
      (profile: BuildName) =>
        Effect.gen(function* () {
          const started = yield* Clock.currentTimeMillis;
          const result = yield* build(profile, { force });
          const finished = yield* Clock.currentTimeMillis;
          yield* Console.log(
            `${profile}: ${result.ledger.size} contracts (${finished - started} ms) — ${(isL2Profile(profile) ? l2Profiles[profile] : profiles[profile]).description}`,
          );
        }),
      { concurrency: 1 },
    ),
).pipe(Command.withDescription("Build profiles (all when none is named) and cache their state"));
