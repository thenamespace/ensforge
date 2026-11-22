import { Effect, Schema } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import type { Address } from "viem";

import { refused, send, succeeds, type CommandSpec } from "../model/command.ts";
import { Index, stable } from "../model/expect.ts";
import {
  pick,
  targetOf,
  v1Resolves,
  v2Status,
  type Model,
  type Primary as ModelPrimary,
} from "../model/model.ts";
import type { World } from "../model/world.ts";
import { actorOf, targetsOf } from "./names.ts";

/** Sets the actor's primary name, or clears it, for Ethereum, as the default, or both. */
export const Primary = Schema.Struct({
  kind: Schema.Literal("primary"),
  name: Index,
  actor: Index,
  clear: Schema.Boolean,
  /** Absent in corpus entries from before 1.2: `"eth"`. */
  coin: Schema.optionalKey(Schema.Literals(["eth", "default", "all"])),
});

/** The reverse records after the command (see `Primary` in the model). */
const nextRecords = (
  records: ModelPrimary,
  coin: "eth" | "default" | "all",
  name: string | null,
): ModelPrimary => {
  if (coin === "eth") return { ...records, eth: name };
  if (name === null) {
    return coin === "all" ? { eth: null, fallback: "" } : { ...records, fallback: "" };
  }
  // Setting the default clears an `addr.reverse` entry holding another name.
  return { eth: records.eth === name ? name : null, fallback: name };
};

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
      const coin = command.coin ?? "eth";
      // The default name's check also accepts the name's default EVM address, which the model
      // does not track; the precedence of the two records is what this command exercises.
      const verify = coin === "eth";
      const expected = stable(model, (at) =>
        name === null || !verify || forwardOf(at, world, name) === actor.address
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
        { name, coin, verify },
        expected,
      );
      if (!outcome.ok) return model;

      const records = model.primary[actor.address] ?? { eth: null, fallback: "" };
      return {
        ...model,
        primary: { ...model.primary, [actor.address]: nextRecords(records, coin, name) },
      };
    }),
};
