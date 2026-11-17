import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";

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

  const info = yield* Actions.migration.get(context.reader, { name, account });
  const simulated = yield* Actions.migration.migrate
    .simulate(context.as[actor], { names: name, resolver: "keep" })
    .pipe(
      Effect.map((simulation) => ({
        ok: simulation.ok,
        code: simulation.steps.find((step) => !step.ok)?.error?.code,
      })),
      Effect.catch((error) => Effect.succeed({ ok: false, code: error.code })),
      Effect.catchDefect((defect) => Effect.succeed({ ok: false, code: String(defect) })),
    );
  if ((info.status === "eligible") !== simulated.ok) {
    return yield* new SequenceFailure({
      message: `migration.get(${name}, ${actor}) is ${info.status} (${JSON.stringify(info.blockers)}), but migrating ${simulated.ok ? "simulates" : `fails ${simulated.code}`}`,
    });
  }
});
