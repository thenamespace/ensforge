import { Effect, Schema } from "effect";

import { either, refused, send, succeeds, type CommandSpec } from "../model/command.ts";
import { Index, stable } from "../model/expect.ts";
import { isFree, pick, v1Status, v2Status, withV1, withV2 } from "../model/model.ts";
import { actorNames } from "../model/world.ts";
import { targetsOf } from "./names.ts";

export const SetText = Schema.Struct({
  kind: Schema.Literal("setText"),
  name: Index,
  actor: Index,
  value: Index,
});

export const setText: CommandSpec<typeof SetText.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const name = pick(targetsOf(world), command.name) as string;
      const label = name.slice(0, -".eth".length);
      const actorName = pick(actorNames, command.actor) as (typeof actorNames)[number];
      const actor = world.actors[actorName];
      const url = `https://${command.value}.example`;
      const isV1 = world.v1Names.includes(name);
      const expected = stable(model, (at) => {
        if (isV1) {
          const entry = at.v1[name];
          const status = v1Status(at, world.constants, name);
          if (entry === undefined || status === "expired") return refused("NAME_EXPIRED");
          if (entry.resolver === null) return refused("RESOLVER_NOT_FOUND");
          const allowed = actor === entry.manager;
          if (status === "grace") return either("NAME_EXPIRED", "NOT_OWNER", "NOT_APPROVED");
          return allowed ? succeeds : refused("NOT_OWNER", "NOT_APPROVED", "MISSING_ROLES");
        }
        const entry = at.v2[label];
        const status = v2Status(at, world.constants, label);
        if (entry === undefined || isFree(status)) {
          return refused("NAME_NOT_REGISTERED", "NAME_EXPIRED");
        }
        if (status !== "registered") return refused("NAME_EXPIRED");
        if (entry.resolver === null) return refused("RESOLVER_NOT_FOUND");
        return actor === entry.recordsAdmin ? succeeds : refused("MISSING_ROLES", "NOT_OWNER");
      });

      const outcome = yield* send(
        context,
        actorName,
        "record.set",
        { name, texts: { url } },
        expected,
      );
      if (!outcome.ok) return model;

      if (isV1) {
        const entry = model.v1[name];
        return entry === undefined ? model : withV1(model, name, { ...entry, url });
      }
      const entry = model.v2[label];
      return entry === undefined ? model : withV2(model, label, { ...entry, url });
    }),
};
