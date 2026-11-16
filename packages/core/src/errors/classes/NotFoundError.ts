import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in NotFoundError.Code]: (options: NotFoundError.Options) => EnsforgeError.Defaults;
} = {
  RESOLVER_NOT_FOUND: () => ({
    shortMessage: "The name has no resolver.",
    hint: "Set one with resolver.set.",
  }),
  RECORD_NOT_FOUND: (o: NotFoundError.Options) => ({
    shortMessage: `The record${o.resource === undefined ? "" : ` ${o.resource}`} is not set.`,
  }),
  PRIMARY_NAME_NOT_SET: () => ({ shortMessage: "The address has no primary name." }),
  REGISTRY_NOT_FOUND: () => ({ shortMessage: "No registry was found for this name." }),
  PLAN_NOT_FOUND: () => ({ shortMessage: "No saved plan was found with this id." }),
};

/**
 * Something the call requires does not exist. Reads only throw this with `strict: true`;
 * otherwise they return `null`.
 *
 * @category errors
 * @since 1.0.0
 */
export class NotFoundError extends EnsforgeError<"NotFoundError", NotFoundError.Code> {
  /** What was missing, e.g. a record key. */
  readonly resource: string | undefined;

  constructor(options: NotFoundError.Options) {
    super("NotFoundError", withDefaults(defaults[options.code](options), options));
    this.resource = options.resource;
  }
}

export declare namespace NotFoundError {
  type Code =
    | "RESOLVER_NOT_FOUND"
    | "RECORD_NOT_FOUND"
    | "PRIMARY_NAME_NOT_SET"
    | "REGISTRY_NOT_FOUND"
    | "PLAN_NOT_FOUND";
  type Options = EnsforgeError.ClassOptions<Code> & { readonly resource?: string | undefined };
}
