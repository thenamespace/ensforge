import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in UnsupportedError.Code]: (
    options: UnsupportedError.Options,
  ) => EnsforgeError.Defaults;
} = {
  UNSUPPORTED_PROTOCOL: (o: UnsupportedError.Options) => ({
    shortMessage: `This operation is not supported for ${o.protocol ?? "this"} names.`,
  }),
  UNSUPPORTED_ON_DEPLOYMENT: (o: UnsupportedError.Options) => ({
    shortMessage: `${o.feature ?? "This feature"} is not available on this deployment.`,
  }),
  RESOLVER_PROFILE_UNSUPPORTED: () => ({
    shortMessage: "The resolver does not support this record type.",
    hint: "Point the name at a resolver that supports it, e.g. the public resolver.",
  }),
  PAYMENT_TOKEN_UNSUPPORTED: () => ({
    shortMessage: "The registrar does not accept this payment token.",
  }),
  UPGRADE_NOT_APPROVED: () => ({
    shortMessage: "The upgrade target is not an approved implementation.",
  }),
  WALLET_BATCH_UNSUPPORTED: () => ({
    shortMessage: "The wallet cannot send calls as one batch.",
    hint: 'Use `mode: "auto"` or `mode: "sequential"`.',
  }),
};

/**
 * The operation is not available for this name, resolver, deployment or wallet.
 *
 * @category errors
 * @since 1.0.0
 */
export class UnsupportedError extends EnsforgeError<"UnsupportedError", UnsupportedError.Code> {
  readonly feature: string | undefined;
  readonly protocol: "v1" | "v2" | undefined;

  constructor(options: UnsupportedError.Options) {
    super("UnsupportedError", withDefaults(defaults[options.code](options), options));
    this.feature = options.feature;
    this.protocol = options.protocol;
  }
}

export declare namespace UnsupportedError {
  type Code =
    | "UNSUPPORTED_PROTOCOL"
    | "UNSUPPORTED_ON_DEPLOYMENT"
    | "RESOLVER_PROFILE_UNSUPPORTED"
    | "PAYMENT_TOKEN_UNSUPPORTED"
    | "UPGRADE_NOT_APPROVED"
    | "WALLET_BATCH_UNSUPPORTED";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly feature?: string | undefined;
    readonly protocol?: "v1" | "v2" | undefined;
  };
}
