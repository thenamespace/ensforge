import { Effect, Schema, Array as Arr } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";

import { either, refused, send, succeeds, type CommandSpec } from "../model/command.ts";
import { Index, stable } from "../model/expect.ts";
import { isOperator, pick, v2Status, withV2 } from "../model/model.ts";
import { v2Labels } from "../model/world.ts";
import { actorOf, v2Unregistered } from "./names.ts";

/** Grants or revokes `setResolver` on an ENSv2 name's registry entry. */
export const Role = Schema.Struct({
  kind: Schema.Literal("role"),
  name: Index,
  actor: Index,
  grantee: Index,
  grant: Schema.Boolean,
});
/** Approves or removes an operator for all of the actor's ETH registry names. */
export const Operator = Schema.Struct({
  kind: Schema.Literal("operator"),
  actor: Index,
  operator: Index,
  approved: Schema.Boolean,
});

export const role: CommandSpec<typeof Role.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const label = pick(v2Labels, command.name);
      const actor = actorOf(world, command.actor);
      const grantee = actorOf(world, command.grantee).address;
      const entry = model.v2[label];
      // The owner's own roles are not part of the model; changing them is left out.
      if (entry !== undefined && grantee === entry.owner) return model;

      const expected = stable(model, (at) => {
        const current = at.v2[label];
        const unregistered = v2Unregistered(at, world, label);
        if (current === undefined || unregistered !== undefined) {
          return either(
            "NAME_NOT_REGISTERED",
            "NAME_EXPIRED",
            "CANNOT_GRANT_ROLES",
            "MISSING_ROLES",
          );
        }
        if (actor.address === current.owner) return succeeds;
        // An operator's reach is left to the permission oracle.
        return isOperator(at, current.owner, actor.address)
          ? either("CANNOT_GRANT_ROLES", "MISSING_ROLES", "NOT_OWNER")
          : refused("CANNOT_GRANT_ROLES", "MISSING_ROLES", "NOT_OWNER");
      });

      const options = { roles: ["setResolver"], target: "registry", name: `${label}.eth` } as const;
      const outcome = command.grant
        ? yield* send(
            context,
            actor.name,
            Actions.role.grant,
            Actions.role.grantSync,
            { ...options, grantee },
            expected,
          )
        : yield* send(
            context,
            actor.name,
            Actions.role.revoke,
            Actions.role.revokeSync,
            { ...options, holder: grantee },
            expected,
          );
      if (!outcome.ok || entry === undefined) return model;
      // A grant on a lapsed name's old token is not the model's concern.
      if (v2Status(model, world.constants, label) !== "registered") return model;

      const others = Arr.filter(entry.delegates, (delegate) => delegate !== grantee);
      return withV2(model, label, {
        ...entry,
        delegates: command.grant ? [...others, grantee] : others,
      });
    }),
};

export const operator: CommandSpec<typeof Operator.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const devnet = yield* Devnet;
      const actor = actorOf(context.world, command.actor);
      const operatorAddress = actorOf(context.world, command.operator).address;
      if (operatorAddress === actor.address) return model;

      const outcome = yield* send(
        context,
        actor.name,
        Actions.approval.setOperator,
        Actions.approval.setOperatorSync,
        {
          operator: operatorAddress,
          approved: command.approved,
          contract: devnet.contract("v2.ethRegistry"),
        },
        succeeds,
      );
      if (!outcome.ok) return model;

      const others = Arr.filter(
        model.operators[actor.address] ?? [],
        (address) => address !== operatorAddress,
      );
      return {
        ...model,
        operators: {
          ...model.operators,
          [actor.address]: command.approved ? [...others, operatorAddress] : others,
        },
      };
    }),
};
