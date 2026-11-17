import { Effect, Exit, Schema } from "effect";

import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Chain, type Devnet } from "@ensforge/test-devnet";
import { Clients, type Client } from "@ensforge/test-integration/support/clients";

import { anyCode } from "./expect.ts";
import type { Model } from "./model.ts";
import type { ActorName, World } from "./world.ts";

/** A sequence step that broke the model's prediction or an invariant. */
export class SequenceFailure extends Schema.TaggedError<
  SequenceFailure,
  { readonly brand: unique symbol }
>()("SequenceFailure", {
  message: Schema.String,
}) {}

export type Context = {
  readonly world: World;
  /** A client per actor, writing as that actor. */
  readonly as: Readonly<Record<ActorName, Client>>;
  /** A client without an account, for reads. */
  readonly reader: Client;
  /** How often each write succeeded or failed with each code, to show what a run exercised. */
  readonly outcomes: Map<string, number>;
};

export const makeContext = Effect.fnUntraced(function* (world: World) {
  const clients = yield* Clients;
  return {
    world,
    as: {
      alice: clients.make({ account: world.actors.alice }),
      bob: clients.make({ account: world.actors.bob }),
      carol: clients.make({ account: world.actors.carol }),
    },
    reader: clients.reader,
    outcomes: new Map(),
  } satisfies Context;
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

/** A write of `Actions` (e.g. `Actions.name.transfer`): its path and its gas estimate. */
type WriteAction<Options> = {
  readonly path: string;
  readonly estimateGas: (
    client: Client,
    options: Options,
  ) => Effect.Effect<Plan.Estimate, Errors.AnyError>;
};

/** The write's `…Sync` sibling (e.g. `Actions.name.transferSync`). */
type SyncAction<Options> = (
  client: Client,
  options: Options & { readonly onStep: Chain["Service"]["passWaits"] },
) => Effect.Effect<Write.SyncResult, Errors.AnyError>;

/**
 * Sends `write` as `actor` and checks the outcome against `expected`. Any failure must be a typed
 * ensforge error; a single-step plan that succeeds must have been estimated at or above the gas
 * it used.
 */
export const send = <Options>(
  context: Context,
  actor: ActorName,
  write: WriteAction<Options>,
  sync: SyncAction<NoInfer<Options>>,
  options: NoInfer<Options>,
  expected: Expectation,
): Effect.Effect<Outcome, SequenceFailure, Chain | Devnet> =>
  Effect.gen(function* () {
    const chain = yield* Chain;
    const ens = context.as[actor];
    const label = `${actor} ${write.path}(${JSON.stringify(options, (_, value) => (typeof value === "bigint" ? `${value}n` : value))})`;

    const estimated = yield* Effect.exit(write.estimateGas(ens, options));
    const outcome = yield* sync(ens, { ...options, onStep: chain.passWaits }).pipe(
      Effect.map((result): Outcome | { readonly raw: unknown } => ({ ok: true, result })),
      Effect.catch((error) => Effect.succeed({ ok: false as const, code: error.code })),
      Effect.catchDefect((defect) => Effect.succeed({ raw: defect })),
    );

    const key = `${write.path} ${"raw" in outcome ? "raw" : outcome.ok ? "ok" : outcome.code}`;
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
    if (!outcome.ok && !allowed.includes(outcome.code) && !allowed.includes(anyCode)) {
      return yield* new SequenceFailure({
        message: `${label} failed ${outcome.code}; expected ${allowed.join(" | ") || "success"}`,
      });
    }

    if (outcome.ok && Exit.isSuccess(estimated) && outcome.result.plan.steps.length === 1) {
      const used = outcome.result.receipts.reduce((total, receipt) => total + receipt.gasUsed, 0n);
      if (estimated.value.gas < used) {
        return yield* new SequenceFailure({
          message: `${label} was estimated at ${estimated.value.gas} gas and used ${used}`,
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
  ) => Effect.Effect<Model, SequenceFailure, Chain | Devnet>;
};
