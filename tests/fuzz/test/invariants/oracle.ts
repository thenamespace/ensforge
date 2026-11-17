import { Effect } from "effect";

import { Errors, type Plan } from "@ensforge/sdk";

import { targetsOf } from "../commands/names.ts";
import { SequenceFailure, type Client, type Context } from "../model/command.ts";
import { subLabel, actorNames } from "../model/world.ts";
import type { sampler } from "./sample.ts";

type Simulate = (options: object) => Promise<Plan.Simulation>;

/** Each checked operation, with the write that performs it. */
const operations = [
  {
    operation: "transfer",
    path: "name.transfer",
    options: (name: string, to: string) => ({ name, to }),
  },
  {
    operation: "setResolver",
    path: "resolver.set",
    options: (name: string) => ({ name, resolver: null }),
  },
  {
    operation: "createSubname",
    path: "subname.create",
    options: (name: string) => ({ name: `oracle-${subLabel}.${name}` }),
  },
  {
    operation: { setRecord: "text", key: "url" },
    path: "record.set",
    options: (name: string) => ({ name, texts: { url: "https://oracle.example" } }),
  },
] as const;

const simulateOf = (client: Client, path: string) => {
  const [domain = "", name = ""] = path.split(".");
  const write = (client as unknown as Record<string, Record<string, { simulate: Simulate }>>)[
    domain
  ]?.[name];
  if (write === undefined) throw new Error(`${path} is not a write`);
  return write.simulate;
};

/**
 * The permission oracle: for a sampled name, operation and account, `permission.check` allows the
 * operation exactly when simulating the write that performs it succeeds. A write refused before
 * simulation (a typed precheck) counts as not allowed.
 */
export const permissionOracle = Effect.fnUntraced(function* (
  context: Context,
  choose: ReturnType<typeof sampler>,
) {
  const { world } = context;
  const name = choose(targetsOf(world));
  const actor = choose(actorNames);
  const other = world.actors[choose(actorNames.filter((candidate) => candidate !== actor))];
  const { operation, path, options } = choose(operations);
  const account = world.actors[actor];

  const check = yield* Effect.promise(() =>
    context.reader.permission.check({ name, operation, account }),
  );
  // `null`: the engine cannot tell (e.g. an unknown resolver); nothing to compare.
  if (check.allowed === null) return;
  const simulated = yield* Effect.promise(() =>
    simulateOf(
      context.as[actor],
      path,
    )(options(name, other)).then(
      (simulation) => ({
        ok: simulation.ok,
        code: simulation.steps.find((step) => !step.ok)?.error?.code,
      }),
      (error: unknown) => ({ ok: false, code: Errors.is(error) ? error.code : String(error) }),
    ),
  );
  if (check.allowed !== simulated.ok) {
    return yield* new SequenceFailure({
      message: `permission.check(${name}, ${JSON.stringify(operation)}, ${actor}) says ${check.allowed ? "allowed" : `not allowed (${JSON.stringify(check.missing)})`}, but ${path}.simulate ${simulated.ok ? "succeeds" : `fails ${simulated.code}`}`,
    });
  }
});
