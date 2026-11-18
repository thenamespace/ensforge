import type { Hex } from "viem";

import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in CommitmentError.Code]: (
    options: CommitmentError.Options,
  ) => EnsforgeError.Defaults;
} = {
  COMMITMENT_TOO_NEW: (o: CommitmentError.Options) => ({
    shortMessage: "The registration commitment is not ready yet.",
    hint:
      o.readyAt === undefined
        ? "Wait for the minimum commitment age, then register."
        : `Register at or after unix time ${o.readyAt}.`,
  }),
  COMMITMENT_TOO_OLD: () => ({
    shortMessage: "The registration commitment has expired.",
    hint: "Commit again, then register.",
  }),
  COMMITMENT_EXISTS: () => ({
    shortMessage: "An unexpired commitment with the same data already exists.",
  }),
  COMMITMENT_NOT_FOUND: () => ({
    shortMessage: "No commitment was found for this registration.",
    hint: "Commit first with registration.commit or registration.register.",
  }),
};

/**
 * A `.eth` commit-reveal registration step is out of order or out of time.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export class CommitmentError extends EnsforgeError<"CommitmentError", CommitmentError.Code> {
  readonly commitment: Hex | undefined;
  /** Unix time (seconds) from which `register` succeeds. */
  readonly readyAt: bigint | undefined;
  /** Unix time (seconds) after which the commitment is too old. */
  readonly expiresAt: bigint | undefined;

  constructor(options: CommitmentError.Options) {
    super(
      "CommitmentError",
      withDefaults(defaults[options.code](options), options, options.code === "COMMITMENT_TOO_NEW"),
    );
    this.commitment = options.commitment;
    this.readyAt = options.readyAt;
    this.expiresAt = options.expiresAt;
  }
}

export declare namespace CommitmentError {
  type Code =
    | "COMMITMENT_TOO_NEW"
    | "COMMITMENT_TOO_OLD"
    | "COMMITMENT_EXISTS"
    | "COMMITMENT_NOT_FOUND";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly commitment?: Hex | undefined;
    readonly readyAt?: bigint | undefined;
    readonly expiresAt?: bigint | undefined;
  };
}
