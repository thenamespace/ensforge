import { Effect, Schema } from "effect";

import {
  either,
  refused,
  send,
  succeeds,
  type CommandSpec,
  type Expectation,
} from "../model/command.ts";
import { Index, stable } from "../model/expect.ts";
import { isFree, pick, v1Status, v2Status, withV1, withV2, type Model } from "../model/model.ts";
import { resyncV1 } from "../model/sync.ts";
import { actorNames, readV2, travelTo, v2Labels, type World } from "../model/world.ts";

const year = 31_536_000n;

export const Register = Schema.Struct({
  kind: Schema.Literal("register"),
  name: Index,
  actor: Index,
  years: Schema.Literals([1, 2]),
  url: Schema.Boolean,
});
export const Renew = Schema.Struct({
  kind: Schema.Literal("renew"),
  name: Index,
  actor: Index,
  years: Schema.Literals([1, 2]),
});
export const Transfer = Schema.Struct({
  kind: Schema.Literal("transfer"),
  /** Over the ENSv2 labels, then the ENSv1 names. */
  name: Index,
  actor: Index,
  to: Index,
});
/** Moves time to just before, at or after a name's expiry or grace end, or by a day. */
export const Wait = Schema.Struct({
  kind: Schema.Literal("wait"),
  name: Index,
  boundary: Schema.Literals(["expiry", "graceEnd", "day"]),
  offset: Schema.Literals([-1, 0, 1]),
});

/** Every name commands can target: the ENSv2 labels as `.eth` names, then the ENSv1 names. */
export const targetsOf = (world: World) => [
  ...v2Labels.map((label) => `${label}.eth`),
  ...world.v1Names,
];

const labelOf = (name: string) => name.slice(0, -".eth".length);

export const register: CommandSpec<typeof Register.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const label = pick(v2Labels, command.name) as string;
      const actorName = pick(actorNames, command.actor) as (typeof actorNames)[number];
      const actor = world.actors[actorName];
      const url = command.url ? `https://${label}.example/${model.now}` : null;
      const expected = stable(model, (at) =>
        isFree(v2Status(at, world.constants, label)) ? succeeds : refused("NAME_NOT_AVAILABLE"),
      );

      const outcome = yield* send(
        context,
        actorName,
        "registration.register",
        {
          names: `${label}.eth`,
          duration: BigInt(command.years) * year,
          records: { addresses: { eth: actor }, ...(url === null ? {} : { texts: { url } }) },
        },
        expected,
      );
      if (!outcome.ok) return model;

      // The expiry and the deployed resolver are chosen by the chain.
      const entry = yield* readV2(world, label);
      return withV2(model, label, {
        owner: actor,
        expiry: entry.expiry,
        resolver: entry.resolver,
        recordsAdmin: actor,
        url,
        delegates: [],
        sub: null,
      });
    }),
};

export const renew: CommandSpec<typeof Renew.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const label = pick(v2Labels, command.name) as string;
      const duration = BigInt(command.years) * year;
      const expected = stable(model, (at) =>
        isFree(v2Status(at, world.constants, label)) ? refused("NAME_NOT_RENEWABLE") : succeeds,
      );

      const outcome = yield* send(
        context,
        pick(actorNames, command.actor) as (typeof actorNames)[number],
        "registration.renew",
        { names: `${label}.eth`, duration },
        expected,
      );
      const entry = model.v2[label];
      if (!outcome.ok || entry === undefined) return model;

      return withV2(model, label, { ...entry, expiry: entry.expiry + duration });
    }),
};

const transferV2 = (
  model: Model,
  world: World,
  label: string,
  actor: string,
  to: string,
): Expectation =>
  stable(model, (at) => {
    const entry = at.v2[label];
    const status = v2Status(at, world.constants, label);
    if (entry === undefined || isFree(status)) {
      return refused("NAME_NOT_REGISTERED", "NAME_EXPIRED");
    }
    if (status !== "registered") return refused("NAME_EXPIRED", "NAME_NOT_REGISTERED");
    if (actor !== entry.owner) return refused("MISSING_ROLES", "NOT_OWNER", "NOT_APPROVED");
    if (entry.delegates.length > 0) return refused("TRANSFER_DISALLOWED");
    return to === entry.owner ? either() : succeeds;
  });

const transferV1 = (
  model: Model,
  world: World,
  name: string,
  actor: string,
  to: string,
): Expectation =>
  stable(model, (at) => {
    const entry = at.v1[name];
    if (entry === undefined) return refused("NAME_NOT_REGISTERED");
    const status = v1Status(at, world.constants, name);
    if (status === "expired") return refused("NAME_EXPIRED");
    if (status === "grace") return either("NAME_EXPIRED");
    // A transfer to the current holder may be a no-op the SDK accepts or declines.
    const same = to === entry.manager && (entry.wrapped || to === entry.registrant);
    if (entry.wrapped) {
      if (actor !== entry.manager) return refused("NOT_OWNER", "NOT_APPROVED");
      return same ? either() : succeeds;
    }
    if (actor === entry.registrant && actor === entry.manager) return same ? either() : succeeds;
    if (actor === entry.registrant || actor === entry.manager) {
      return either("NOT_OWNER", "NOT_APPROVED");
    }
    return refused("NOT_OWNER", "NOT_APPROVED");
  });

export const transfer: CommandSpec<typeof Transfer.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const name = pick(targetsOf(world), command.name) as string;
      const actorName = pick(actorNames, command.actor) as (typeof actorNames)[number];
      const actor = world.actors[actorName];
      const to = world.actors[pick(actorNames, command.to) as (typeof actorNames)[number]];
      const isV1 = world.v1Names.includes(name);
      const expected = isV1
        ? transferV1(model, world, name, actor, to)
        : transferV2(model, world, labelOf(name), actor, to);

      const outcome = yield* send(context, actorName, "name.transfer", { name, to }, expected);
      if (!outcome.ok) return model;

      if (isV1) {
        const entry = model.v1[name];
        // Where the model does not decide, the chain's state is taken as the outcome.
        if (entry === undefined || !("ok" in expected)) return yield* resyncV1(world, model, name);
        return withV1(
          model,
          name,
          entry.wrapped ? { ...entry, manager: to } : { ...entry, manager: to, registrant: to },
        );
      }
      const entry = model.v2[labelOf(name)];
      return entry === undefined ? model : withV2(model, labelOf(name), { ...entry, owner: to });
    }),
};

export const wait: CommandSpec<typeof Wait.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const name = pick(targetsOf(world), command.name) as string;
      const v1 = model.v1[name];
      const v2 = model.v2[labelOf(name)];
      const expiry = world.v1Names.includes(name) ? v1?.expiry : v2?.expiry;
      const grace = world.v1Names.includes(name)
        ? world.constants.v1GracePeriod
        : world.constants.gracePeriod;
      const boundary =
        command.boundary === "day" || expiry === undefined
          ? model.now + 86_400n
          : command.boundary === "expiry"
            ? expiry
            : expiry + grace;
      const target = boundary + BigInt(command.offset);
      // Time only moves forward; a boundary already passed becomes a day's wait.
      const timestamp = target > model.now ? target : model.now + 86_400n;

      yield* travelTo(world, timestamp);
      return { ...model, now: timestamp };
    }),
};
