import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in NameStateError.Code]: (
    options: NameStateError.Options,
  ) => EnsforgeError.Defaults;
} = {
  NAME_NOT_AVAILABLE: () => ({ shortMessage: "The name is already registered." }),
  NAME_NOT_REGISTERED: () => ({ shortMessage: "The name is not registered." }),
  NAME_EXTERNAL: () => ({
    shortMessage: "The name is not in ENS's registries: its parent's resolver serves it.",
    hint: "Its parent's namespace manages it (an L2, or the provider's app or API); ENS writes cannot change it.",
  }),
  NAME_RESERVED: () => ({ shortMessage: "The name is reserved." }),
  NAME_EXPIRED: () => ({ shortMessage: "The name has expired." }),
  NAME_NOT_RENEWABLE: () => ({ shortMessage: "The name cannot be renewed." }),
  NAME_LOCKED: () => ({ shortMessage: "The name is locked." }),
  NAME_NOT_WRAPPED: () => ({ shortMessage: "The name is not wrapped in the NameWrapper." }),
  NAME_WRAPPED: () => ({ shortMessage: "The name is already wrapped in the NameWrapper." }),
  NAME_UNREACHABLE: () => ({
    shortMessage: "ENSv2 resolution no longer reaches this ENSv1 name.",
    hint: "ENSv2 resolves it elsewhere: an ancestor moved to ENSv2 without it, or ENSv2 holds no reservation for it. Ask the parent's owner to recreate it there.",
  }),
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
 * @stability stable
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
    | "NAME_NOT_REGISTERED"
    | "NAME_EXTERNAL"
    | "NAME_RESERVED"
    | "NAME_EXPIRED"
    | "NAME_NOT_RENEWABLE"
    | "NAME_LOCKED"
    | "NAME_NOT_WRAPPED"
    | "NAME_WRAPPED"
    | "NAME_UNREACHABLE"
    | "NAME_REQUIRES_MIGRATION"
    | "PARENT_NOT_MIGRATED"
    | "REGISTRY_NOT_EMANCIPATED";
  type Options = EnsforgeError.ClassOptions<Code>;
}
