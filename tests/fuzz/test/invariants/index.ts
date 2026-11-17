import { Effect } from "effect";

import { Errors } from "@ensforge/sdk";

import type { Command } from "../commands/index.ts";
import { SequenceFailure, type Context } from "../model/command.ts";
import { nearBoundary } from "../model/expect.ts";
import type { Model } from "../model/model.ts";
import { librariesAgree } from "./differential.ts";
import { migrationPredicts } from "./migration.ts";
import { permissionOracle } from "./oracle.ts";
import { resolutionAgrees } from "./resolution.ts";
import { sampler } from "./sample.ts";
import { readsMatchModel } from "./state.ts";

/** Every invariant, checked after each command; the sampled ones vary with the step. */
export const invariants = (context: Context, model: Model, step: number, command: Command) =>
  Effect.gen(function* () {
    const choose = sampler(step, command);
    yield* readsMatchModel(context, model);
    yield* resolutionAgrees(context, model, choose);
    yield* librariesAgree(context, choose);
    // Predictions about the next block are only compared away from time boundaries.
    if (nearBoundary(model, context.world)) return;
    yield* permissionOracle(context, choose);
    yield* migrationPredicts(context, choose);
  }).pipe(
    // A read that fails is a finding like a mismatch, so it is shrunk and reported.
    Effect.catchIf(Errors.is, (error) =>
      Effect.fail(new SequenceFailure({ message: `read failed: ${error.code}` })),
    ),
  );
