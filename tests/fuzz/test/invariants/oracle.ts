import { Array as Arr, Effect, Formatter, Option } from "effect";

import { Actions } from "@ensforge/sdk/effect";
import type { Client } from "@ensforge/test-integration/support/clients";
import type { Address } from "viem";

import { targetsOf } from "../commands/names.ts";
import { SequenceFailure, type Context } from "../model/command.ts";
import { subLabel, actorNames } from "../model/world.ts";
import type { sampler } from "./sample.ts";

/** Each checked operation, with a simulation of the write that performs it. */
const operations = [
  {
    operation: "transfer",
    simulate: (ens: Client, name: string, to: Address) =>
      Actions.name.transfer.simulate(ens, { name, to }),
  },
  {
    operation: "setResolver",
    simulate: (ens: Client, name: string) =>
      Actions.resolver.set.simulate(ens, { name, resolver: null }),
  },
  {
    operation: "createSubname",
    simulate: (ens: Client, name: string) =>
      Actions.subname.create.simulate(ens, { name: `oracle-${subLabel}.${name}` }),
  },
  {
    operation: { setRecord: "text", key: "url" },
    simulate: (ens: Client, name: string) =>
      Actions.record.set.simulate(ens, { name, texts: { url: "https://oracle.example" } }),
  },
] as const;

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
  const other = world.actors[choose(Arr.filter(actorNames, (candidate) => candidate !== actor))];
  const { operation, simulate } = choose(operations);
  const account = world.actors[actor];

  const check = yield* Actions.permission.check(context.reader, { name, operation, account });
  // `null`: the engine cannot tell (e.g. an unknown resolver); nothing to compare.
  if (check.allowed === null) return undefined;
  const simulated = yield* simulate(context.as[actor], name, other).pipe(
    Effect.map((simulation) => ({
      ok: simulation.ok,
      code: Option.getOrUndefined(
        Option.map(
          Arr.findFirst(simulation.steps, (step) => !step.ok),
          (step) => step.error?.code,
        ),
      ),
    })),
    Effect.catch((error) => Effect.succeed({ ok: false, code: error.code })),
    Effect.catchDefect((defect) => Effect.succeed({ ok: false, code: String(defect) })),
  );
  if (check.allowed !== simulated.ok) {
    return yield* SequenceFailure.make({
      message: `permission.check(${name}, ${Formatter.formatJson(operation)}, ${actor}) says ${check.allowed ? "allowed" : `not allowed (${Formatter.formatJson(check.missing)})`}, but simulating it ${simulated.ok ? "succeeds" : `fails ${simulated.code}`}`,
    });
  }

  return undefined;
});
