import { assertTrue, strictEqual } from "@effect/vitest/utils";
import { Effect } from "effect";

/** What a failure must look like: an ensforge error class and code. */
export type ExpectedError = { readonly _tag: string; readonly code?: string | undefined };

/**
 * Runs `effect`, expects it to fail with an ensforge error matching `expected`, and returns that
 * error for further assertions. A success fails the test with the value.
 */
export const expectFailure = <A, E>(
  effect: Effect.Effect<A, E>,
  expected: ExpectedError,
): Effect.Effect<E & { readonly _tag: string; readonly code: string }, A> =>
  Effect.flip(effect).pipe(
    Effect.map((error) => {
      const tagged = error as E & { readonly _tag: string; readonly code: string };
      strictEqual(tagged._tag, expected._tag);
      if (expected.code !== undefined) strictEqual(tagged.code, expected.code);
      return tagged;
    }),
  );

/** Runs a Promise-returning call and expects it to reject with a matching ensforge error. */
export const expectRejection = (thunk: () => Promise<unknown>, expected: ExpectedError) =>
  Effect.flip(Effect.tryPromise({ try: thunk, catch: (cause) => cause })).pipe(
    Effect.map((cause) => {
      const error = cause as { readonly _tag?: string; readonly code?: string };
      assertTrue(error !== null && typeof error === "object", "rejected with a non-object");
      strictEqual(error._tag, expected._tag);
      if (expected.code !== undefined) strictEqual(error.code, expected.code);
      return error;
    }),
  );
