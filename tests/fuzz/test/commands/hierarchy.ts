import { Effect, Schema } from "effect";

import type { Address } from "viem";

import {
  either,
  refused,
  send,
  succeeds,
  type CommandSpec,
  type Expectation,
} from "../model/command.ts";
import { Index, stable } from "../model/expect.ts";
import {
  burned,
  isOperator,
  pick,
  targetOf,
  v1Status,
  withV1,
  withV2,
  type Model,
  type Target,
} from "../model/model.ts";
import { subLabel, type World } from "../model/world.ts";
import { actorOf, targetsOf, v2Unregistered } from "./names.ts";

/** Creates or removes `sub.<name>`. */
export const Subname = Schema.Struct({
  kind: Schema.Literal("subname"),
  name: Index,
  actor: Index,
  remove: Schema.Boolean,
});

const expectation = (
  model: Model,
  world: World,
  target: Target,
  actor: string,
  remove: boolean,
): Expectation =>
  stable(model, (at) => {
    if (target.protocol === "v1") {
      const entry = at.v1[target.name];
      const status = v1Status(at, world.constants, target.name);
      if (entry === undefined || status === "expired") return refused("NAME_EXPIRED");
      if (status === "grace") {
        return either("NAME_EXPIRED", "NAME_NOT_REGISTERED", "NOT_OWNER", "NOT_APPROVED");
      }
      if (remove && entry.sub === null) return refused("NAME_NOT_REGISTERED");
      if (!remove && burned(entry, "cannotCreateSubdomain") && actor !== entry.manager) {
        return refused("FUSE_BURNED", "NAME_NOT_AVAILABLE", "NOT_OWNER", "NOT_APPROVED");
      }
      if (actor !== entry.manager) {
        // The child's own holder may or may not be let to remove it; a taken child is reported
        // before the account.
        if (remove && actor === entry.sub) return either("NOT_OWNER", "NOT_APPROVED");
        return !remove && entry.sub !== null
          ? refused("NAME_NOT_AVAILABLE", "NOT_OWNER", "NOT_APPROVED")
          : refused("NOT_OWNER", "NOT_APPROVED");
      }
      if (!remove && burned(entry, "cannotCreateSubdomain")) return refused("FUSE_BURNED");
      return !remove && entry.sub !== null ? either("NAME_NOT_AVAILABLE") : succeeds;
    }

    const entry = at.v2[target.label];
    const unregistered = v2Unregistered(at, world, target.label);
    if (entry === undefined || unregistered !== undefined) {
      return unregistered ?? refused("NAME_NOT_REGISTERED");
    }
    if (remove && entry.sub === null) return refused("NAME_NOT_REGISTERED", "NAME_EXPIRED");
    if (!remove && entry.sub !== null) {
      return either("NAME_NOT_AVAILABLE", "MISSING_ROLES", "NOT_OWNER");
    }
    // An operator's reach is left to the permission oracle.
    if (isOperator(at, entry.owner, actor as Address)) return either("MISSING_ROLES", "NOT_OWNER");
    // The subregistry's roles belong to whoever deployed it.
    const admin = entry.subregistryAdmin ?? entry.owner;
    if (actor === entry.owner && actor === admin) return succeeds;
    return actor === entry.owner || actor === admin
      ? either("MISSING_ROLES", "NOT_OWNER")
      : refused("MISSING_ROLES", "NOT_OWNER");
  });

export const subname: CommandSpec<typeof Subname.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const target = targetOf(model, world, pick(targetsOf(world), command.name) as string);
      const actor = actorOf(world, command.actor);
      const name = `${subLabel}.${target.name}`;
      const expected = expectation(model, world, target, actor.address, command.remove);

      const outcome = yield* send(
        context,
        actor.name,
        command.remove ? "subname.remove" : "subname.create",
        { name },
        expected,
      );
      if (!outcome.ok) return model;

      const sub = command.remove ? null : actor.address;
      if (target.protocol === "v1") return withV1(model, target.name, { ...target.entry, sub });
      const entry = model.v2[target.label];
      if (entry === undefined) return model;
      return withV2(model, target.label, {
        ...entry,
        sub,
        subregistryAdmin: entry.subregistryAdmin ?? actor.address,
      });
    }),
};
