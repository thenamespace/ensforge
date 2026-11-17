import { Effect } from "effect";

import { Errors, type Plan } from "@ensforge/sdk";

import { SequenceFailure, type Context } from "../model/command.ts";
import { actorNames } from "../model/world.ts";
import type { sampler } from "./sample.ts";

/** For a sampled ENSv1 name and account, `migration.get` predicts whether migrating simulates. */
export const migrationPredicts = Effect.fnUntraced(function* (
  context: Context,
  choose: ReturnType<typeof sampler>,
) {
  const { world } = context;
  const name = choose(world.v1Names);
  const actor = choose(actorNames);
  const account = world.actors[actor];

  const info = yield* Effect.promise(() => context.reader.migration.get({ name, account }));
  const migrate = context.as[actor].migration.migrate as unknown as {
    readonly simulate: (options: object) => Promise<Plan.Simulation>;
  };
  const simulated = yield* Effect.promise(() =>
    migrate.simulate({ names: name, resolver: "keep" }).then(
      (simulation) => ({
        ok: simulation.ok,
        code: simulation.steps.find((step) => !step.ok)?.error?.code,
      }),
      (error: unknown) => ({ ok: false, code: Errors.is(error) ? error.code : String(error) }),
    ),
  );
  if ((info.status === "eligible") !== simulated.ok) {
    return yield* new SequenceFailure({
      message: `migration.get(${name}, ${actor}) is ${info.status} (${JSON.stringify(info.blockers)}), but migrating ${simulated.ok ? "simulates" : `fails ${simulated.code}`}`,
    });
  }
});
