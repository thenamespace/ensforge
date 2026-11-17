import { Cause, Option } from "effect";
import { AsyncResult } from "effect/reactivity";

/**
 * What a read hook returns.
 *
 * @category reads
 * @since 1.0.0
 */
export type ReadResult<value, error> = {
  /** The latest value, kept while refreshing. */
  readonly data: value | undefined;
  /** The action's error when it failed. */
  readonly error: error | undefined;
  /** `idle` while disabled, `loading` until the first result, then `success` or `error`. */
  readonly status: "idle" | "loading" | "success" | "error";
  /** No result yet and loading. */
  readonly isLoading: boolean;
  /** Loading again with a previous result shown. */
  readonly isRefreshing: boolean;
  /** The Effect Atom result, for `AsyncResult.match`. */
  readonly result: AsyncResult.AsyncResult<value, error>;
  /** Refetches the read. */
  readonly refresh: () => void;
};

const statusOf = (
  result: AsyncResult.AsyncResult<unknown, unknown>,
): ReadResult<unknown, unknown>["status"] => {
  if (AsyncResult.isSuccess(result)) return "success";
  if (AsyncResult.isFailure(result)) return "error";
  return result.waiting ? "loading" : "idle";
};

/** The typed error of a failure, or the defect itself when it is not one. */
export const errorOf = <error>(
  result: AsyncResult.AsyncResult<unknown, error>,
): error | undefined =>
  AsyncResult.isFailure(result)
    ? Option.getOrElse(AsyncResult.error(result), () => Cause.squash(result.cause) as error)
    : undefined;

/** A read atom's result as the object read hooks return. */
export const toReadResult = <value, error>(
  result: AsyncResult.AsyncResult<value, error>,
  refresh: () => void,
): ReadResult<value, error> => ({
  data: Option.getOrUndefined(AsyncResult.value(result)),
  error: errorOf(result),
  status: statusOf(result),
  isLoading: AsyncResult.isInitial(result) && result.waiting,
  isRefreshing: !AsyncResult.isInitial(result) && result.waiting,
  result,
  refresh,
});
