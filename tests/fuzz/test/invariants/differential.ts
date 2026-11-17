import { Effect } from "effect";

import { targetsOf } from "../commands/names.ts";
import { disagreeing, readName, readPrimary } from "../differential/compare.ts";
import { SequenceFailure, type Context } from "../model/command.ts";
import { actorNames } from "../model/world.ts";
import type { sampler } from "./sample.ts";

/** For a sampled fuzz name and actor, ensforge reads what viem and ensjs read. */
export const librariesAgree = Effect.fnUntraced(function* (
  context: Context,
  choose: ReturnType<typeof sampler>,
) {
  const { world } = context;
  const name = choose(targetsOf(world));
  const actor = world.actors[choose(actorNames)];
  const readings = [
    ...(yield* readName(context.reader, name)),
    yield* readPrimary(context.reader, actor),
  ];

  for (const reading of readings) {
    const libraries = disagreeing(reading);
    if (libraries.length === 0) continue;
    return yield* new SequenceFailure({
      message: `${reading.field === "primary name" ? actor : name} ${reading.field}: ensforge reads ${String(reading.ensforge)}, ${libraries.map((library) => `${library} ${String(reading[library])}`).join(", ")}`,
    });
  }
});
