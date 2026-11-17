import { Effect } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { getEnsText } from "viem/actions";

import { targetsOf } from "../commands/names.ts";
import { SequenceFailure, type Context } from "../model/command.ts";
import { targetOf, v1Resolves, v2Status, type Model } from "../model/model.ts";
import { readUrl } from "../model/sync.ts";
import type { sampler } from "./sample.ts";

/**
 * Resolution consistency for a sampled name: ensforge's `record.getText` equals viem's Universal
 * Resolver lookup, and, while the name resolves through its own resolver, that resolver's record.
 */
export const resolutionAgrees = Effect.fnUntraced(function* (
  context: Context,
  model: Model,
  choose: ReturnType<typeof sampler>,
) {
  const { world } = context;
  const name = choose(targetsOf(world));
  const ensforge = yield* Actions.record.getText(context.reader, { name, key: "url" }).pipe(
    Effect.catch((error) => Effect.succeed(`error ${error.code}`)),
    Effect.catchDefect((defect) => Effect.succeed(`untyped ${String(defect)}`)),
  );
  const viem = yield* Effect.promise(() =>
    getEnsText(world.devnet.client, { name, key: "url" }).then(
      (url) => url,
      () => null,
    ),
  );
  if (ensforge !== viem) {
    return yield* new SequenceFailure({
      message: `${name}: ensforge resolves url ${String(ensforge)}, viem's Universal Resolver ${String(viem)}`,
    });
  }

  const target = targetOf(model, world, name);
  const resolves =
    target.protocol === "v1"
      ? v1Resolves(model, name)
      : v2Status(model, world.constants, target.label) === "registered";
  const resolver =
    target.protocol === "v1" ? target.entry.resolver : (model.v2[target.label]?.resolver ?? null);
  if (!resolves || resolver === null) return;
  const direct = yield* readUrl(world, resolver, name);
  if (ensforge !== direct) {
    return yield* new SequenceFailure({
      message: `${name}: ensforge resolves url ${String(ensforge)}, its resolver holds ${String(direct)}`,
    });
  }
});
