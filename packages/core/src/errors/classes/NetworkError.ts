import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in NetworkError.Code]: (options: NetworkError.Options) => EnsforgeError.Defaults;
} = {
  RPC_REQUEST_FAILED: () => ({ shortMessage: "The RPC request failed." }),
  RPC_TIMEOUT: () => ({ shortMessage: "The RPC request timed out." }),
  RATE_LIMITED: () => ({
    shortMessage: "The RPC provider is rate limiting requests.",
    hint: "Retry later, or use an RPC URL with a higher limit.",
  }),
};

/**
 * The RPC provider could not be reached or rejected the request. Usually worth retrying.
 *
 * @category errors
 * @since 1.0.0
 */
export class NetworkError extends EnsforgeError<"NetworkError", NetworkError.Code> {
  /** HTTP status, when the transport is HTTP. */
  readonly status: number | undefined;

  constructor(options: NetworkError.Options) {
    super("NetworkError", withDefaults(defaults[options.code](options), options, true));
    this.status = options.status;
  }
}

export declare namespace NetworkError {
  type Code = "RPC_REQUEST_FAILED" | "RPC_TIMEOUT" | "RATE_LIMITED";
  type Options = EnsforgeError.ClassOptions<Code> & { readonly status?: number | undefined };
}
