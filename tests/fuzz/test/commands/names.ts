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
  isFree,
  pick,
  targetOf,
  v1Status,
  v2Status,
  withV1,
  withV2,
  type Model,
} from "../model/model.ts";
import { resyncV1 } from "../model/sync.ts";
import {
  actorNames,
  readV2,
  travelTo,
  v2Labels,
  type ActorName,
  type World,
} from "../model/world.ts";

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

export const actorOf = (world: World, index: number) => {
  const name = pick(actorNames, index) as ActorName;
  return { name, address: world.actors[name] };
};

/** Refusals of a write on an ENSv2 name that is not registered now. */
export const v2Unregistered = (
  model: Model,
  world: World,
  label: string,
): Expectation | undefined => {
  const status = v2Status(model, world.constants, label);
  if (isFree(status)) return refused("NAME_NOT_REGISTERED", "NAME_EXPIRED");
  return status === "registered" ? undefined : refused("NAME_EXPIRED", "NAME_NOT_REGISTERED");
};

export const register: CommandSpec<typeof Register.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const label = pick(v2Labels, command.name) as string;
      const actor = actorOf(world, command.actor);
      const url = command.url ? `https://${label}.example/${model.now}` : null;
      const expected = stable(model, (at) =>
        isFree(v2Status(at, world.constants, label)) ? succeeds : refused("NAME_NOT_AVAILABLE"),
      );

      const outcome = yield* send(
        context,
        actor.name,
        "registration.register",
        {
          names: `${label}.eth`,
          duration: BigInt(command.years) * year,
          records: {
            addresses: { eth: actor.address },
            ...(url === null ? {} : { texts: { url } }),
          },
        },
        expected,
      );
      if (!outcome.ok) return model;

      // The expiry and the deployed resolver are chosen by the chain.
      const entry = yield* readV2(world, label);
      return withV2(model, label, {
        owner: actor.address,
        expiry: entry.expiry,
        resolver: entry.resolver,
        ownResolver: entry.resolver,
        recordsAdmin: actor.address,
        url,
        addr: actor.address,
        delegates: [],
        sub: null,
        subregistryAdmin: null,
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
        actorOf(world, command.actor).name,
        "registration.renew",
        { names: `${label}.eth`, duration },
        expected,
      );
      const entry = model.v2[label];
      if (!outcome.ok || entry === undefined) return model;

      return withV2(model, label, { ...entry, expiry: entry.expiry + duration });
    }),
};

const transferV2 = (model: Model, world: World, label: string, actor: Address, to: Address) =>
  stable(model, (at) => {
    const entry = at.v2[label];
    const unregistered = v2Unregistered(at, world, label);
    if (entry === undefined || unregistered !== undefined) {
      return unregistered ?? refused("NAME_NOT_REGISTERED");
    }
    const operator = at.operators[entry.owner]?.includes(actor) ?? false;
    if (actor !== entry.owner && !operator) {
      return refused("MISSING_ROLES", "NOT_OWNER", "NOT_APPROVED");
    }
    if (entry.delegates.some((delegate) => delegate !== to)) return refused("TRANSFER_DISALLOWED");
    return to === entry.owner || entry.delegates.length > 0
      ? either("TRANSFER_DISALLOWED")
      : succeeds;
  });

const transferV1 = (
  model: Model,
  world: World,
  name: string,
  actor: Address,
  to: Address,
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
      // A burned fuse blocks everyone, so it may be reported before the account.
      if (burned(entry, "cannotTransfer")) {
        return actor === entry.manager
          ? refused("FUSE_BURNED")
          : refused("FUSE_BURNED", "NOT_OWNER", "NOT_APPROVED");
      }
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
      const target = targetOf(model, world, pick(targetsOf(world), command.name) as string);
      const actor = actorOf(world, command.actor);
      const to = actorOf(world, command.to).address;
      const expected =
        target.protocol === "v1"
          ? transferV1(model, world, target.name, actor.address, to)
          : transferV2(model, world, target.label, actor.address, to);

      const outcome = yield* send(
        context,
        actor.name,
        "name.transfer",
        { name: target.name, to },
        expected,
      );
      if (!outcome.ok) return model;

      if (target.protocol === "v1") {
        // Where the model does not decide, the chain's state is taken as the outcome.
        if (!("ok" in expected)) return yield* resyncV1(world, model, target.name);
        const { entry } = target;
        return withV1(
          model,
          target.name,
          entry.wrapped ? { ...entry, manager: to } : { ...entry, manager: to, registrant: to },
        );
      }
      const entry = model.v2[target.label];
      return entry === undefined ? model : withV2(model, target.label, { ...entry, owner: to });
    }),
};

export const wait: CommandSpec<typeof Wait.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const target = targetOf(model, world, pick(targetsOf(world), command.name) as string);
      const expiry =
        target.protocol === "v1" ? target.entry.expiry : model.v2[target.label]?.expiry;
      const grace =
        target.protocol === "v1" ? world.constants.v1GracePeriod : world.constants.gracePeriod;
      const boundary =
        command.boundary === "day" || expiry === undefined
          ? model.now + 86_400n
          : command.boundary === "expiry"
            ? expiry
            : expiry + grace;
      const moment = boundary + BigInt(command.offset);
      // Time only moves forward; a boundary already passed becomes a day's wait.
      const timestamp = moment > model.now ? moment : model.now + 86_400n;

      yield* travelTo(world, timestamp);
      return { ...model, now: timestamp };
    }),
};
