import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in GatewayError.Code]: (options: GatewayError.Options) => EnsforgeError.Defaults;
} = {
  GATEWAY_REQUEST_FAILED: (o: GatewayError.Options) => ({
    shortMessage: `The off-chain gateway request failed${o.status === undefined ? "" : ` (HTTP ${o.status})`}.`,
  }),
  GATEWAY_RESPONSE_INVALID: () => ({
    shortMessage: "The off-chain gateway returned an invalid response.",
  }),
  OFFCHAIN_LOOKUP_INVALID: () => ({
    shortMessage: "The resolver requested an off-chain lookup from an unexpected sender.",
  }),
};

/**
 * Off-chain resolution (CCIP-Read, ERC-3668) failed.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export class GatewayError extends EnsforgeError<"GatewayError", GatewayError.Code> {
  readonly status: number | undefined;
  readonly url: string | undefined;

  constructor(options: GatewayError.Options) {
    super(
      "GatewayError",
      withDefaults(
        defaults[options.code](options),
        options,
        options.code === "GATEWAY_REQUEST_FAILED",
      ),
    );
    this.status = options.status;
    this.url = options.url;
  }
}

export declare namespace GatewayError {
  type Code = "GATEWAY_REQUEST_FAILED" | "GATEWAY_RESPONSE_INVALID" | "OFFCHAIN_LOOKUP_INVALID";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly status?: number | undefined;
    readonly url?: string | undefined;
  };
}
