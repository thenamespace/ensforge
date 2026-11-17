import type { Request } from "../Types.js";

/** A batch's requests: a list, or a record of named requests. */
export type Requests = readonly Request[] | { readonly [key: string]: Request };

/** One request's outcome when failures are allowed. */
export type Settled<value, error> =
  | { readonly status: "success"; readonly result: value }
  | { readonly status: "failure"; readonly error: error };

/** Results in the requests' shape: a tuple for a list, a record for a record. */
export type Results<requests extends Requests, allowFailure extends boolean> = {
  -readonly [key in keyof requests]: requests[key] extends Request<infer value, infer error>
    ? allowFailure extends false
      ? value
      : Settled<value, error>
    : never;
};

/** Options of `Actions.batch`. */
export type BatchOptions<requests extends Requests, allowFailure extends boolean> = {
  /** Deferred reads from `action.request(options)`, as a list or a record. */
  readonly requests: requests;
  /**
   * Report each request's failure in its result instead of failing the batch.
   *
   * @default true
   */
  readonly allowFailure?: allowFailure | undefined;
  /** Cancels the batch; the Promise rejects with `signal.reason`. */
  readonly signal?: AbortSignal | undefined;
};
