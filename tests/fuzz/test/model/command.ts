import { Effect, Schema } from "effect";

import { Errors, type Plan, type Write } from "@ensforge/sdk";
import { ensforge, passWaits } from "@ensforge/test-integration/support/chain";

import type { Model } from "./model.ts";
import type { ActorName, World } from "./world.ts";

/** A sequence step that broke the model's prediction or an invariant. */
export class SequenceFailure extends Schema.TaggedError<SequenceFailure>()("SequenceFailure", {
  message: Schema.String,
}) {}

export type Client = ReturnType<typeof ensforge>;

export type Context = {
  readonly world: World;
  /** A client per actor, writing as that actor. */
  readonly as: Readonly<Record<ActorName, Client>>;
  /** A client without an account, for reads. */
  readonly reader: Client;
  /** How often each write succeeded or failed with each code, to show what a run exercised. */
  readonly outcomes: Map<string, number>;
};

export const makeContext = (world: World): Context => ({
  world,
  as: {
    alice: ensforge(world.devnet, { account: world.actors.alice }),
    bob: ensforge(world.devnet, { account: world.actors.bob }),
    carol: ensforge(world.devnet, { account: world.actors.carol }),
  },
  reader: ensforge(world.devnet),
  outcomes: new Map(),
});

/**
 * What the model predicts for a write: success, a refusal with one of `codes`, or (where the
 * model does not decide) either.
 */
export type Expectation =
  | { readonly ok: true }
  | { readonly refused: readonly string[] }
  | { readonly either: readonly string[] };

export const succeeds: Expectation = { ok: true };
export const refused = (...codes: readonly string[]): Expectation => ({ refused: codes });
export const either = (...codes: readonly string[]): Expectation => ({ either: codes });

export type Outcome =
  | { readonly ok: true; readonly result: Write.SyncResult }
  | { readonly ok: false; readonly code: string };

type WriteFn = ((options: object) => Promise<Write.SyncResult>) & {
  readonly estimateGas?: (options: object) => Promise<Plan.Estimate>;
};

const writeOf = (client: Client, path: string) => {
  const [domain = "", name = ""] = path.split(".");
  const group = (client as unknown as Record<string, Record<string, WriteFn>>)[domain];
  const sync = group?.[`${name}Sync`];
  const estimate = group?.[name]?.estimateGas;
  if (sync === undefined || estimate === undefined) throw new Error(`${path} is not a write`);
  return { sync, estimate };
};

const describe = (path: string, options: object) =>
  `${path}(${JSON.stringify(options, (_, value) => (typeof value === "bigint" ? `${value}n` : value))})`;

/**
 * Sends `path` as `actor` and checks the outcome against `expected`. Any failure must be a typed
 * ensforge error; a single-step plan that succeeds must have been estimated at or above the gas
 * it used.
 */
export const send = Effect.fnUntraced(function* (
  context: Context,
  actor: ActorName,
  path: string,
  options: object,
  expected: Expectation,
): Effect.fn.Return<Outcome, SequenceFailure> {
  const { sync, estimate } = writeOf(context.as[actor], path);
  const label = `${actor} ${describe(path, options)}`;
  const estimated = yield* Effect.promise(() =>
    estimate(options).then(
      (result) => result,
      () => undefined,
    ),
  );
  const outcome = yield* Effect.promise((): Promise<Outcome | { readonly raw: unknown }> =>
    sync({ ...options, onStep: passWaits(context.world.devnet) }).then(
      (result) => ({ ok: true, result }),
      (error: unknown) => (Errors.is(error) ? { ok: false, code: error.code } : { raw: error }),
    ),
  );

  const key = `${path} ${"raw" in outcome ? "raw" : outcome.ok ? "ok" : outcome.code}`;
  context.outcomes.set(key, (context.outcomes.get(key) ?? 0) + 1);

  if ("raw" in outcome) {
    return yield* new SequenceFailure({
      message: `${label} failed with an untyped error: ${String(outcome.raw)}`,
    });
  }
  if ("ok" in expected && !outcome.ok) {
    return yield* new SequenceFailure({ message: `${label} was refused: ${outcome.code}` });
  }
  if ("refused" in expected && outcome.ok) {
    return yield* new SequenceFailure({
      message: `${label} succeeded; expected ${expected.refused.join(" | ")}`,
    });
  }
  const allowed =
    "refused" in expected ? expected.refused : "either" in expected ? expected.either : [];
  if (!outcome.ok && !allowed.includes(outcome.code)) {
    return yield* new SequenceFailure({
      message: `${label} failed ${outcome.code}; expected ${allowed.join(" | ") || "success"}`,
    });
  }

  if (outcome.ok && estimated !== undefined && outcome.result.plan.steps.length === 1) {
    const used = outcome.result.receipts.reduce((total, receipt) => total + receipt.gasUsed, 0n);
    if (estimated.gas < used) {
      return yield* new SequenceFailure({
        message: `${label} was estimated at ${estimated.gas} gas and used ${used}`,
      });
    }
  }
  return outcome;
});

/** A generated command: plain data, resolved against the model when it runs. */
export type Command = { readonly kind: string };

export type CommandSpec<C extends Command> = {
  readonly run: (
    context: Context,
    model: Model,
    command: C,
  ) => Effect.Effect<Model, SequenceFailure>;
};
