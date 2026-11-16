import type { Hex } from "viem";

import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

/**
 * A contract reverted with an error ensforge does not map to a more specific class.
 *
 * @category errors
 * @since 1.0.0
 */
export class ContractRevertError extends EnsforgeError<
  "ContractRevertError",
  ContractRevertError.Code
> {
  /** Decoded error name, e.g. `InvalidRecord`, when the ABI knows it. */
  readonly errorName: string | undefined;
  readonly args: readonly unknown[];
  /** Raw revert data. */
  readonly data: Hex | undefined;

  constructor(options: ContractRevertError.Options) {
    const shortMessage =
      options.errorName === undefined
        ? "The contract call reverted."
        : `The contract call reverted with ${options.errorName}.`;
    super("ContractRevertError", withDefaults({ shortMessage }, options));
    this.errorName = options.errorName;
    this.args = options.args ?? [];
    this.data = options.data;
  }
}

export declare namespace ContractRevertError {
  type Code = "CONTRACT_REVERTED";
  type Options = EnsforgeError.ClassOptions<Code> & {
    readonly errorName?: string | undefined;
    readonly args?: readonly unknown[] | undefined;
    readonly data?: Hex | undefined;
  };
}
