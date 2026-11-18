import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const describeInput = (input: unknown): string =>
  typeof input === "string" ? `"${input}"` : String(input);

const defaults: {
  readonly [code in InvalidInputError.Code]: (
    options: InvalidInputError.Options,
  ) => EnsforgeError.Defaults;
} = {
  INVALID_NAME: (o: InvalidInputError.Options) => ({
    shortMessage: `${describeInput(o.input)} is not a valid ENS name.`,
    hint: "Names must normalize under ENSIP-15, e.g. `nick.eth`.",
  }),
  INVALID_ADDRESS: (o: InvalidInputError.Options) => ({
    shortMessage: `${describeInput(o.input)} is not a valid address.`,
  }),
  INVALID_COIN_TYPE: (o: InvalidInputError.Options) => ({
    shortMessage: `${describeInput(o.input)} is not a known coin type.`,
    hint: "Pass a symbol (`btc`), `{ chainId }` or a numeric coin type.",
  }),
  INVALID_CONTENT_HASH: (o: InvalidInputError.Options) => ({
    shortMessage: `${describeInput(o.input)} is not a valid content hash.`,
    hint: "Use a URI such as `ipfs://…`, `ipns://…`, `bzz://…` or `ar://…`.",
  }),
  INVALID_RECORD_VALUE: (o: InvalidInputError.Options) => ({
    shortMessage:
      o.field === undefined
        ? `${describeInput(o.input)} is not a valid record value.`
        : `${describeInput(o.input)} is not a valid value for ${o.field}.`,
  }),
  INVALID_DURATION: (o: InvalidInputError.Options) => ({
    shortMessage: `${describeInput(o.input)} is not a valid duration.`,
    hint: "Durations are bigint seconds, e.g. Duration.years(1).",
  }),
  DURATION_TOO_SHORT: () => ({
    shortMessage: "The duration is shorter than the registrar's minimum.",
  }),
  INVALID_EXPIRY: () => ({
    shortMessage: "The expiry cannot be in the past or earlier than the current expiry.",
  }),
  INVALID_ROLES: (o: InvalidInputError.Options) => ({
    shortMessage: `${describeInput(o.input)} is not a valid role bitmap.`,
  }),
  SALT_TAKEN: () => ({
    shortMessage: "A contract was already deployed with this salt.",
    hint: "Use the existing contract, or pass another `salt`.",
  }),
};

/**
 * An argument is invalid. Detected before any network request.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export class InvalidInputError extends EnsforgeError<"InvalidInputError", InvalidInputError.Code> {
  /** The rejected value. */
  readonly input: unknown;
  /** The option it was passed as, when relevant. */
  readonly field: string | undefined;

  constructor(options: InvalidInputError.Options) {
    super("InvalidInputError", withDefaults(defaults[options.code](options), options));
    this.input = options.input;
    this.field = options.field;
  }
}

export declare namespace InvalidInputError {
  type Code =
    | "INVALID_NAME"
    | "INVALID_ADDRESS"
    | "INVALID_COIN_TYPE"
    | "INVALID_CONTENT_HASH"
    | "INVALID_RECORD_VALUE"
    | "INVALID_DURATION"
    | "DURATION_TOO_SHORT"
    | "INVALID_EXPIRY"
    | "INVALID_ROLES"
    | "SALT_TAKEN";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly input?: unknown;
    readonly field?: string | undefined;
  };
}
