import type { Effect } from "effect";

import type { Ensforge, Errors } from "@ensforge/sdk";

/**
 * Any ensforge action from `@ensforge/sdk` or `@ensforge/sdk/effect`, or one of a write's
 * `.prepare`, `.simulate` and `.estimateGas`: a function of a client and options, named by its
 * `path`.
 *
 * @category actions
 * @since 1.0.0
 */
export type Action = ((client: Ensforge.Client, options: never) => unknown) & {
  readonly path: string;
};

/**
 * Options an action takes.
 *
 * @category actions
 * @since 1.0.0
 */
export type ActionOptions<action extends Action> = Parameters<action>[1];

/**
 * Value an action resolves with.
 *
 * @category actions
 * @since 1.0.0
 */
export type ActionValue<action extends Action> =
  ReturnType<action> extends Promise<infer value>
    ? value
    : ReturnType<action> extends Effect.Effect<infer value, unknown, unknown>
      ? value
      : never;

/**
 * Error an action fails with: the Effect action's error channel, or any ensforge error for
 * Promise actions.
 *
 * @category actions
 * @since 1.0.0
 */
export type ActionError<action extends Action> =
  ReturnType<action> extends Effect.Effect<unknown, infer error, unknown> ? error : Errors.AnyError;
