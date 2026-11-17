import { Effect } from "effect";

import type { Command } from "../commands/index.ts";
import type { Context } from "../model/command.ts";
import type { Model } from "../model/model.ts";
import { readsMatchModel } from "./state.ts";

/** Every invariant, checked after each command. */
export const invariants = (context: Context, model: Model, _command: Command) =>
  Effect.gen(function* () {
    yield* readsMatchModel(context, model);
  });
