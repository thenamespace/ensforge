import type { Effect } from "effect";

/**
 * An action's Effect implementation (or an object of them, such as a write's methods) with its
 * error channel set to the errors the action declares (`ErrorType`, generated from `@throws`).
 *
 * The shared RPC and revert translation are typed `AnyError`, since a revert can map to any class;
 * the declared union is what the action documents, and the error-type check of the test lanes
 * fails when an action fails outside it.
 *
 * @stability unstable
 */
export type Declared<implementation, error> = implementation extends (
  ...args: infer args
) => Effect.Effect<infer value, unknown, infer requirements>
  ? ((...args: args) => Effect.Effect<value, error, requirements>) & {
      readonly [key in keyof implementation]: implementation[key];
    }
  : { readonly [key in keyof implementation]: Declared<implementation[key], error> };
