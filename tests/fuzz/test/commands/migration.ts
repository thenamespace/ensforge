import { Effect, Schema } from "effect";

import { Name } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";

import { either, SequenceFailure, send, type CommandSpec } from "../model/command.ts";
import { anyCode, Index, nearBoundary } from "../model/expect.ts";
import { pick, withV1 } from "../model/model.ts";
import { resyncV2 } from "../model/sync.ts";
import { actorOf } from "./names.ts";

/** Migrates an ENSv1 name to ENSv2, keeping its resolver. */
export const Migrate = Schema.Struct({
  kind: Schema.Literal("migrate"),
  name: Index,
  actor: Index,
});

// Whether a migration may go ahead is `migration.get`'s call; the migration invariant checks that
// it predicts the outcome. Here any typed refusal is accepted.
const refusals = [
  "NOT_ELIGIBLE",
  "ALREADY_MIGRATED",
  "RECORDS_UNKNOWN",
  "NOT_OWNER",
  "NOT_APPROVED",
  "FUSE_BURNED",
  "NAME_EXPIRED",
  "NAME_NOT_REGISTERED",
  "UNSUPPORTED_PROTOCOL",
  "INVALID_RECORD_VALUE",
];

export const migrate: CommandSpec<typeof Migrate.Type> = {
  run: (context, model, command) =>
    Effect.gen(function* () {
      const { world } = context;
      const name = pick(world.v1Names, command.name) as string;
      const actor = actorOf(world, command.actor);
      const entry = model.v1[name];
      if (entry === undefined) return model;
      const owner = entry.wrapped ? entry.manager : entry.registrant;
      const { label } = Name.parse(name);

      const outcome = yield* send(
        context,
        actor.name,
        Actions.migration.migrate,
        Actions.migration.migrateSync,
        { names: name, resolver: "keep" },
        // Near an expiry the name may lapse between the check and the next block's simulation.
        nearBoundary(model, world) ? either(anyCode) : either(...refusals),
      );
      if (!outcome.ok) return model;

      // The migrated name keeps its owner and resolver; who may edit its records is left open.
      const migrated = yield* resyncV2(withV1(model, name, { ...entry, migrated: true }), label, {
        ownResolver: entry.ownResolver,
        // Records stay in the name's own resolver, whether or not it is set now.
        url: entry.url,
        addr: entry.addr,
        // ENSv1 children stay where they are, still owned by their holder.
        sub: entry.sub,
      });
      const v2 = migrated.v2[label];
      if (v2 === undefined || v2.owner !== owner) {
        return yield* new SequenceFailure({
          message: `${name} migrated to ENSv2 owned by ${v2?.owner ?? "nobody"}, not its ENSv1 owner ${owner}`,
        });
      }
      return migrated;
    }),
};
