import { assert } from "@effect/vitest";
import { assertTrue, strictEqual } from "@effect/vitest/utils";
import { Effect, Formatter, Predicate } from "effect";

/** What a failure must look like: an ensforge error class and code. */
export type ExpectedError = { readonly _tag: string; readonly code?: string | undefined };

/** The member of `E` tagged `Tag`, or `E` itself when none is (an error class `E` does not list). */
type Tagged<E, Tag extends string> = [Extract<E, { readonly _tag: Tag }>] extends [never]
  ? E & { readonly _tag: Tag; readonly code: string }
  : Extract<E, { readonly _tag: Tag }>;

/**
 * The tags `E` declares, so that a literal expected tag outside an action's `ErrorType` does not
 * compile; a tag only known at runtime (`string`) is checked when the test runs.
 */
type Declared<E, Tag extends string> = string extends Tag
  ? string
  : E extends { readonly _tag: infer tag extends string }
    ? tag
    : string;

const isErrorShape = (
  value: unknown,
): value is { readonly _tag?: string; readonly code?: string } => Predicate.isObject(value);

/**
 * Runs `effect`, expects it to fail with an ensforge error matching `expected`, and returns that
 * error, narrowed to its class, for further assertions. A success fails the test with the value.
 */
export const expectFailure = <A, E, const Tag extends string>(
  effect: Effect.Effect<A, E>,
  expected: { readonly _tag: Tag & NoInfer<Declared<E, Tag>>; readonly code?: string | undefined },
): Effect.Effect<Tagged<E, Tag>> =>
  Effect.match(effect, {
    onSuccess: (value) =>
      assert.fail(`expected ${expected._tag} but succeeded with ${Formatter.format(value)}`),
    onFailure: (error) => {
      // The tag is checked below, which narrows `E` to its member; `E` itself is generic.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const tagged = error as Tagged<E, Tag> & { readonly _tag: string; readonly code: string };
      strictEqual(tagged._tag, expected._tag);
      if (expected.code !== undefined) strictEqual(tagged.code, expected.code);
      return tagged;
    },
  });

/** Runs a Promise-returning call and expects it to reject with a matching ensforge error. */
export const expectRejection = <A>(thunk: () => Promise<A>, expected: ExpectedError) =>
  Effect.flip(
    Effect.tryPromise({
      try: thunk,
      catch: (rejection) => ({ rejection }),
    }),
  ).pipe(
    Effect.map(({ rejection }) => {
      assertTrue(isErrorShape(rejection), "rejected with a non-object");
      strictEqual(rejection._tag, expected._tag);
      if (expected.code !== undefined) strictEqual(rejection.code, expected.code);
      return rejection;
    }),
  );

/** Calls `thunk`, expects it to throw a matching ensforge error, and returns that error. */
export const expectThrow = (thunk: () => unknown, expected: ExpectedError) => {
  let thrown: unknown;
  try {
    thunk();
  } catch (cause) {
    thrown = cause;
  }

  assertTrue(isErrorShape(thrown), "did not throw an error object");
  strictEqual(thrown._tag, expected._tag);
  if (expected.code !== undefined) strictEqual(thrown.code, expected.code);
  return thrown;
};
