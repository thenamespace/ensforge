import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";

import { build } from "../build.ts";
import { profileNames, profiles, type ProfileName } from "../profiles/profiles.ts";

export const profileArgument = Argument.Literals("profile", profileNames).pipe(
  Argument.withDescription("Devnet profile"),
);

export const buildCommand = Command.make(
  "build",
  {
    profiles: profileArgument.pipe(Argument.variadic()),
    force: Flag.Boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Rebuild even when a cached build matches"),
    ),
  },
  ({ profiles: selected, force }) =>
    Effect.forEach(selected.length > 0 ? selected : profileNames, (profile: ProfileName) =>
      Effect.gen(function* () {
        const started = Date.now();
        const result = yield* build(profile, { force });
        yield* Console.log(
          `${profile}: ${result.ledger.size} contracts (${Date.now() - started} ms) — ${profiles[profile].description}`,
        );
      }),
    ),
).pipe(Command.withDescription("Build profiles (all when none is named) and cache their state"));
