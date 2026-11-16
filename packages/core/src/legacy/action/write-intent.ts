import type { Effect } from "effect";

import type { Account, Address, WalletClient } from "viem";

import type { EnsforgeConfig } from "../config/config.js";
import type { PreparedWriteCall } from "../write/types.js";
import { defineExtendedAction, type EnsAction, type EnsActionEffect } from "./action.js";

const EnsWriteIntentTypeId: unique symbol = Symbol.for("@ensforge/core/EnsWriteIntent");

const EnsWriteIntentPreparerTypeId: unique symbol = Symbol.for(
  "@ensforge/core/EnsWriteIntent/preparer",
);

const EnsWriteIntentSensitiveTypeId: unique symbol = Symbol.for(
  "@ensforge/core/EnsWriteIntent/sensitive",
);

declare const EnsWriteIntentSuccessTypeId: unique symbol;

declare const EnsWriteIntentFailureTypeId: unique symbol;

export interface EnsWriteIntent<Success, Failure> {
  readonly [EnsWriteIntentTypeId]: typeof EnsWriteIntentTypeId;
  readonly [EnsWriteIntentSuccessTypeId]: Success;
  readonly [EnsWriteIntentFailureTypeId]: Failure;
  readonly operation: string;
  readonly parameters: unknown;
}

export interface WritePreparationContext {
  readonly id: string;
  readonly index: number;
  readonly account: Account | Address;
  readonly chainId: number;
  readonly walletClient: WalletClient;
}

export type PreparedWriteCallDetails = Pick<
  PreparedWriteCall,
  "to" | "data" | "value" | "protocol"
>;

export type EnsWriteIntentPreparer<Parameters, Failure> = (
  config: EnsforgeConfig,
  parameters: Parameters,
  context: WritePreparationContext,
) => Effect.Effect<PreparedWriteCallDetails, Failure>;

export interface EnsWriteAction<Parameters, Success, Failure> extends EnsAction<
  Parameters,
  Success,
  Failure
> {
  readonly call: (parameters: Parameters) => EnsWriteIntent<Success, Failure>;
}

export const makeWriteIntent = <Parameters, Success, Failure>(
  operation: string,
  parameters: Parameters,
  preparer?: EnsWriteIntentPreparer<Parameters, Failure>,
  sensitive = false,
): EnsWriteIntent<Success, Failure> => {
  const intent = {
    [EnsWriteIntentTypeId]: EnsWriteIntentTypeId,
    operation,
    parameters,
  } as EnsWriteIntent<Success, Failure>;

  if (preparer !== undefined) {
    Object.defineProperty(intent, EnsWriteIntentPreparerTypeId, {
      value: preparer,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  if (sensitive) {
    Object.defineProperty(intent, EnsWriteIntentSensitiveTypeId, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  return Object.freeze(intent);
};

export const isSensitiveWriteIntent = (intent: EnsWriteIntent<unknown, unknown>): boolean =>
  Boolean(
    (
      intent as EnsWriteIntent<unknown, unknown> & {
        readonly [EnsWriteIntentSensitiveTypeId]?: boolean;
      }
    )[EnsWriteIntentSensitiveTypeId],
  );

export const getWriteIntentPreparer = <Success, Failure>(
  intent: EnsWriteIntent<Success, Failure>,
): EnsWriteIntentPreparer<unknown, Failure> | undefined =>
  (
    intent as EnsWriteIntent<Success, Failure> & {
      readonly [EnsWriteIntentPreparerTypeId]?: EnsWriteIntentPreparer<unknown, Failure>;
    }
  )[EnsWriteIntentPreparerTypeId];

export const defineWriteAction = <Parameters, Success, Failure>(
  operation: string,
  implementation: EnsActionEffect<Parameters, Success, Failure>,
  preparer?: EnsWriteIntentPreparer<Parameters, Failure>,
  options?: { readonly sensitive?: boolean },
): EnsWriteAction<Parameters, Success, Failure> => {
  const action = defineExtendedAction(implementation);

  return Object.freeze(
    Object.defineProperty(action, "call", {
      value: (parameters: Parameters) =>
        makeWriteIntent<Parameters, Success, Failure>(
          operation,
          parameters,
          preparer,
          options?.sensitive ?? false,
        ),
      enumerable: true,
      configurable: false,
      writable: false,
    }),
  ) as EnsWriteAction<Parameters, Success, Failure>;
};
