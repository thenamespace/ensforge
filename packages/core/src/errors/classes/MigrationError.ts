import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in MigrationError.Code]: (
    options: MigrationError.Options,
  ) => EnsforgeError.Defaults;
} = {
  NOT_ELIGIBLE: (o: MigrationError.Options) => ({
    shortMessage: "The name cannot be migrated to ENSv2 yet.",
    details:
      o.blockers === undefined || o.blockers.length === 0
        ? []
        : [`Blockers: ${o.blockers.join(", ")}`],
  }),
  ALREADY_MIGRATED: () => ({ shortMessage: "The name is already on ENSv2." }),
  NAME_NOT_LOCKED: () => ({
    shortMessage: "The wrapped name is not locked, so it cannot use the locked migration route.",
  }),
};

/**
 * ENSv1 to ENSv2 migration is blocked for this name.
 *
 * @category errors
 * @since 1.0.0
 */
export class MigrationError extends EnsforgeError<"MigrationError", MigrationError.Code> {
  readonly blockers: readonly string[];

  constructor(options: MigrationError.Options) {
    super("MigrationError", withDefaults(defaults[options.code](options), options));
    this.blockers = options.blockers ?? [];
  }
}

export declare namespace MigrationError {
  type Code = "NOT_ELIGIBLE" | "ALREADY_MIGRATED" | "NAME_NOT_LOCKED";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly blockers?: readonly string[] | undefined;
  };
}
