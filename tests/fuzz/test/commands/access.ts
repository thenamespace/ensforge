import { Effect, Schema } from "effect";

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
      const label = pick(v2Labels, command.name) as string;
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

      const outcome = yield* send(
        context,
        actor.name,
        command.grant ? "role.grant" : "role.revoke",
        {
          ...(command.grant ? { grantee } : { holder: grantee }),
          roles: ["setResolver"],
          target: "registry",
          name: `${label}.eth`,
        },
        expected,
      );
      if (!outcome.ok || entry === undefined) return model;
      // A grant on a lapsed name's old token is not the model's concern.
      if (v2Status(model, world.constants, label) !== "registered") return model;

      const others = entry.delegates.filter((delegate) => delegate !== grantee);
      return withV2(model, label, {
        ...entry,
        delegates: command.grant ? [...others, grantee] : others,
      });
    }),
};

export const operator: CommandSpec<typeof Operator.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const actor = actorOf(context.world, command.actor);
      const operatorAddress = actorOf(context.world, command.operator).address;
      if (operatorAddress === actor.address) return model;

      const outcome = yield* send(
        context,
        actor.name,
        "approval.setOperator",
        {
          operator: operatorAddress,
          approved: command.approved,
          contract: context.world.devnet.contracts["v2.ethRegistry"],
        },
        succeeds,
      );
      if (!outcome.ok) return model;

      const others = (model.operators[actor.address] ?? []).filter(
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
