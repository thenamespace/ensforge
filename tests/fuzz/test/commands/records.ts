import { Effect, Schema } from "effect";

import { Actions } from "@ensforge/sdk/effect";

import { either, refused, send, succeeds, type CommandSpec } from "../model/command.ts";
import { Index, stable } from "../model/expect.ts";
import { burned, isOperator, pick, targetOf, v1Status, withV1, withV2 } from "../model/model.ts";
import { resyncV1 } from "../model/sync.ts";
import { actorOf, targetsOf, v2Unregistered } from "./names.ts";

export const SetText = Schema.Struct({
  kind: Schema.Literal("setText"),
  name: Index,
  actor: Index,
  value: Index,
});
/** Clears a name's resolver, or sets back the one it started with. */
export const SetResolver = Schema.Struct({
  kind: Schema.Literal("setResolver"),
  name: Index,
  actor: Index,
  clear: Schema.Boolean,
});

export const setText: CommandSpec<typeof SetText.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const target = targetOf(model, world, pick(targetsOf(world), command.name) as string);
      const actor = actorOf(world, command.actor);
      const url = `https://${command.value}.example`;
      const expected = stable(model, (at) => {
        if (target.protocol === "v1") {
          const entry = at.v1[target.name];
          const status = v1Status(at, world.constants, target.name);
          if (entry === undefined || status === "expired") return refused("NAME_EXPIRED");
          if (entry.resolver === null) return refused("RESOLVER_NOT_FOUND");
          if (status === "grace") return either("NAME_EXPIRED", "NOT_OWNER", "NOT_APPROVED");
          return actor.address === entry.manager
            ? succeeds
            : refused("NOT_OWNER", "NOT_APPROVED", "MISSING_ROLES");
        }
        const entry = at.v2[target.label];
        const unregistered = v2Unregistered(at, world, target.label);
        if (entry === undefined || unregistered !== undefined) {
          return unregistered ?? refused("NAME_NOT_REGISTERED");
        }
        if (entry.resolver === null) return refused("RESOLVER_NOT_FOUND");
        if (entry.recordsAdmin === null)
          return either("MISSING_ROLES", "NOT_OWNER", "NOT_APPROVED");
        return actor.address === entry.recordsAdmin
          ? succeeds
          : refused("MISSING_ROLES", "NOT_OWNER");
      });

      const outcome = yield* send(
        context,
        actor.name,
        Actions.record.set,
        Actions.record.setSync,
        { name: target.name, texts: { url } },
        expected,
      );
      if (!outcome.ok) return model;

      if (target.protocol === "v1") {
        return withV1(model, target.name, { ...target.entry, url });
      }
      const entry = model.v2[target.label];
      return entry === undefined ? model : withV2(model, target.label, { ...entry, url });
    }),
};

export const setResolver: CommandSpec<typeof SetResolver.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const target = targetOf(model, world, pick(targetsOf(world), command.name) as string);
      const actor = actorOf(world, command.actor);
      const own =
        target.protocol === "v1" ? target.entry.ownResolver : model.v2[target.label]?.ownResolver;
      const resolver = command.clear ? null : (own ?? null);
      const expected = stable(model, (at) => {
        if (target.protocol === "v1") {
          const entry = at.v1[target.name];
          const status = v1Status(at, world.constants, target.name);
          if (entry === undefined || status === "expired") return refused("NAME_EXPIRED");
          if (status === "grace") return either("NAME_EXPIRED", "NOT_OWNER", "NOT_APPROVED");
          // A burned fuse blocks everyone, so it may be reported before the account.
          if (burned(entry, "cannotSetResolver")) {
            return actor.address === entry.manager
              ? refused("FUSE_BURNED")
              : refused("FUSE_BURNED", "NOT_OWNER", "NOT_APPROVED");
          }
          return actor.address === entry.manager ? succeeds : refused("NOT_OWNER", "NOT_APPROVED");
        }
        const entry = at.v2[target.label];
        const unregistered = v2Unregistered(at, world, target.label);
        if (entry === undefined || unregistered !== undefined) {
          return unregistered ?? refused("NAME_NOT_REGISTERED");
        }
        if (actor.address === entry.owner || entry.delegates.includes(actor.address)) {
          return succeeds;
        }
        // An operator's reach is left to the permission oracle.
        return isOperator(at, entry.owner, actor.address)
          ? either("MISSING_ROLES", "NOT_OWNER")
          : refused("MISSING_ROLES", "NOT_OWNER");
      });

      const outcome = yield* send(
        context,
        actor.name,
        Actions.resolver.set,
        Actions.resolver.setSync,
        { name: target.name, resolver },
        expected,
      );
      if (!outcome.ok) return model;

      if (target.protocol === "v1") {
        if (!("ok" in expected)) return yield* resyncV1(model, target.name);
        return withV1(model, target.name, { ...target.entry, resolver });
      }
      const entry = model.v2[target.label];
      return entry === undefined ? model : withV2(model, target.label, { ...entry, resolver });
    }),
};
