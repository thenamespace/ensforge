import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in NameStateError.Code]: (
    options: NameStateError.Options,
  ) => EnsforgeError.Defaults;
} = {
  NAME_NOT_AVAILABLE: () => ({ shortMessage: "The name is already registered." }),
  NAME_RESERVED: () => ({ shortMessage: "The name is reserved." }),
  NAME_EXPIRED: () => ({ shortMessage: "The name has expired." }),
  NAME_NOT_RENEWABLE: () => ({ shortMessage: "The name cannot be renewed." }),
  NAME_LOCKED: () => ({ shortMessage: "The name is locked." }),
  NAME_NOT_WRAPPED: () => ({ shortMessage: "The name is not wrapped in the NameWrapper." }),
  NAME_REQUIRES_MIGRATION: () => ({
    shortMessage: "The name must be migrated to ENSv2 first.",
    hint: "Use migration.migrate.",
  }),
  PARENT_NOT_MIGRATED: () => ({
    shortMessage: "The parent name has not been migrated to ENSv2.",
  }),
  REGISTRY_NOT_EMANCIPATED: () => ({
    shortMessage: "The registry is not emancipated, so this transfer is unsafe.",
  }),
};

/**
 * The name is in the wrong state for this operation (registered, expired, locked, …).
 *
 * @category errors
 * @since 1.0.0
 */
export class NameStateError extends EnsforgeError<"NameStateError", NameStateError.Code> {
  constructor(options: NameStateError.Options) {
    super("NameStateError", withDefaults(defaults[options.code](options), options));
  }
}

export declare namespace NameStateError {
  type Code =
    | "NAME_NOT_AVAILABLE"
    | "NAME_RESERVED"
    | "NAME_EXPIRED"
    | "NAME_NOT_RENEWABLE"
    | "NAME_LOCKED"
    | "NAME_NOT_WRAPPED"
    | "NAME_REQUIRES_MIGRATION"
    | "PARENT_NOT_MIGRATED"
    | "REGISTRY_NOT_EMANCIPATED";
  type Options = EnsforgeError.ClassOptions<Code>;
}
