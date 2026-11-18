import { Effect, Schema } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import type { Address } from "viem";

import { refused, send, succeeds, type CommandSpec } from "../model/command.ts";
import { Index, stable } from "../model/expect.ts";
import { pick, targetOf, v1Resolves, v2Status, type Model } from "../model/model.ts";
import type { World } from "../model/world.ts";
import { actorOf, targetsOf } from "./names.ts";

/** Sets the actor's primary name, or clears it. */
export const Primary = Schema.Struct({
  kind: Schema.Literal("primary"),
  name: Index,
  actor: Index,
  clear: Schema.Boolean,
});

/** The address `name` resolves to for ETH in the model, `null` when it does not resolve. */
export const forwardOf = (model: Model, world: World, name: string): Address | null => {
  const target = targetOf(model, world, name);
  if (target.protocol === "v1") {
    const { entry } = target;
    return v1Resolves(model, name) && entry.resolver !== null ? entry.addr : null;
  }
  const entry = model.v2[target.label];
  if (entry === undefined || v2Status(model, world.constants, target.label) !== "registered") {
    return null;
  }
  return entry.resolver === null ? null : entry.addr;
};

export const primary: CommandSpec<typeof Primary.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const name = command.clear ? null : pick(targetsOf(world), command.name);
      const actor = actorOf(world, command.actor);
      const expected = stable(model, (at) =>
        name === null || forwardOf(at, world, name) === actor.address
          ? succeeds
          : refused(
              "PRIMARY_NAME_MISMATCH",
              "NAME_NOT_REGISTERED",
              "NAME_EXPIRED",
              "RESOLVER_NOT_FOUND",
            ),
      );

      const outcome = yield* send(
        context,
        actor.name,
        Actions.primaryName.set,
        Actions.primaryName.setSync,
        { name },
        expected,
      );
      if (!outcome.ok) return model;

      return { ...model, primary: { ...model.primary, [actor.address]: name } };
    }),
};
