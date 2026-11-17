import { Effect, Schema } from "effect";

import { nameWrapperFuses } from "@ensforge/contracts/v1";
import { Actions } from "@ensforge/sdk/effect";
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
import { burned, pick, v1Status, withV1, type Model } from "../model/model.ts";
import { resyncV1 } from "../model/sync.ts";
import { readV1, type World } from "../model/world.ts";
import { actorOf } from "./names.ts";

const fuses = [
  "cannotUnwrap",
  "cannotTransfer",
  "cannotSetResolver",
  "cannotCreateSubdomain",
] as const;

/** Wraps, unwraps or burns one owner-controlled fuse on an ENSv1 name. */
export const Wrapper = Schema.Struct({
  kind: Schema.Literal("wrapper"),
  name: Index,
  actor: Index,
  action: Schema.Literals(["wrap", "unwrap", "burn"]),
  fuse: Index,
});

const expectation = (
  model: Model,
  world: World,
  name: string,
  actor: Address,
  action: (typeof Wrapper.Type)["action"],
  fuse: (typeof fuses)[number],
): Expectation =>
  stable(model, (at) => {
    const entry = at.v1[name];
    if (entry === undefined || entry.migrated) {
      return refused("UNSUPPORTED_PROTOCOL", "NAME_NOT_REGISTERED", "NAME_EXPIRED");
    }
    const status = v1Status(at, world.constants, name);
    if (status === "expired") return refused("NAME_EXPIRED");
    // In grace the name's expiry is checked first, and the NameWrapper still counts it as live.
    if (status === "grace") {
      return either(
        "NAME_EXPIRED",
        "NAME_WRAPPED",
        "NAME_NOT_WRAPPED",
        "NOT_OWNER",
        "NOT_APPROVED",
        "FUSE_BURNED",
        "INVALID_RECORD_VALUE",
      );
    }
    if (action === "wrap") {
      if (entry.wrapped) return refused("NAME_WRAPPED");
      return actor === entry.registrant ? succeeds : refused("NOT_OWNER", "NOT_APPROVED");
    }
    if (!entry.wrapped) return refused("NAME_NOT_WRAPPED");
    // Other owner fuses need CANNOT_UNWRAP burned first; the input is checked before the account.
    if (action === "burn" && fuse !== "cannotUnwrap" && !burned(entry, "cannotUnwrap")) {
      return refused("INVALID_RECORD_VALUE");
    }
    // A burned fuse blocks everyone, so it may be reported before the account.
    const blocking =
      action === "unwrap" ? burned(entry, "cannotUnwrap") : burned(entry, "cannotBurnFuses");
    if (actor !== entry.manager) {
      return blocking
        ? refused("FUSE_BURNED", "NOT_OWNER", "NOT_APPROVED")
        : refused("NOT_OWNER", "NOT_APPROVED");
    }
    if (action === "unwrap") {
      return burned(entry, "cannotUnwrap") ? refused("FUSE_BURNED") : succeeds;
    }
    return burned(entry, "cannotBurnFuses") ? refused("FUSE_BURNED") : succeeds;
  });

export const wrapper: CommandSpec<typeof Wrapper.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const name = pick(world.v1Names, command.name) as string;
      const actor = actorOf(world, command.actor);
      const fuse = pick(fuses, command.fuse) as (typeof fuses)[number];
      const expected = expectation(model, world, name, actor.address, command.action, fuse);

      const outcome =
        command.action === "wrap"
          ? yield* send(
              context,
              actor.name,
              Actions.wrapper.wrap,
              Actions.wrapper.wrapSync,
              { name, owner: actor.address },
              expected,
            )
          : command.action === "unwrap"
            ? yield* send(
                context,
                actor.name,
                Actions.wrapper.unwrap,
                Actions.wrapper.unwrapSync,
                { name, owner: actor.address },
                expected,
              )
            : yield* send(
                context,
                actor.name,
                Actions.wrapper.setFuses,
                Actions.wrapper.setFusesSync,
                { name, fuses: [fuse] },
                expected,
              );
      const entry = model.v1[name];
      if (!outcome.ok || entry === undefined) return model;
      if (!("ok" in expected)) return yield* resyncV1(model, name);

      if (command.action === "burn") {
        return withV1(model, name, { ...entry, fuses: entry.fuses | nameWrapperFuses[fuse] });
      }
      // Wrapping sets the fuses the NameWrapper chooses for a `.eth` name.
      const state = yield* readV1(name);
      return withV1(model, name, {
        ...entry,
        wrapped: command.action === "wrap",
        manager: actor.address,
        registrant: command.action === "wrap" ? state.registrant : actor.address,
        fuses: state.fuses,
      });
    }),
};
