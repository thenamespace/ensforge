import type { Effect } from "effect";

import type { EnsforgeConfig } from "../config/index.js";
import { defineExtendedAction, type EnsAction, type EnsActionEffect } from "./action.js";

const EnsReadRequestTypeId: unique symbol = Symbol.for("@ensforge/core/EnsReadRequest");

const EnsReadRequestEffectTypeId: unique symbol = Symbol.for(
  "@ensforge/core/EnsReadRequest/effect",
);

declare const EnsReadRequestSuccessTypeId: unique symbol;

declare const EnsReadRequestFailureTypeId: unique symbol;

export interface EnsReadRequest<Success, Failure> {
  readonly [EnsReadRequestTypeId]: typeof EnsReadRequestTypeId;
  readonly [EnsReadRequestSuccessTypeId]: Success;
  readonly [EnsReadRequestFailureTypeId]: Failure;
}

interface InternalEnsReadRequest<Success, Failure> extends EnsReadRequest<Success, Failure> {
  readonly [EnsReadRequestEffectTypeId]: (
    config: EnsforgeConfig,
  ) => Effect.Effect<Success, Failure>;
}

export interface EnsReadAction<Parameters, Success, Failure> extends EnsAction<
  Parameters,
  Success,
  Failure
> {
  readonly request: (parameters: Parameters) => EnsReadRequest<Success, Failure>;
}

const makeReadRequest = <Parameters, Success, Failure>(
  implementation: EnsActionEffect<Parameters, Success, Failure>,
  parameters: Parameters,
): EnsReadRequest<Success, Failure> =>
  Object.freeze({
    [EnsReadRequestTypeId]: EnsReadRequestTypeId,
    [EnsReadRequestEffectTypeId]: (config: EnsforgeConfig) => implementation(config, parameters),
  }) as InternalEnsReadRequest<Success, Failure>;

export const defineReadAction = <Parameters, Success, Failure>(
  implementation: EnsActionEffect<Parameters, Success, Failure>,
): EnsReadAction<Parameters, Success, Failure> => {
  const action = defineExtendedAction(implementation);

  return Object.freeze(
    Object.defineProperty(action, "request", {
      value: (parameters: Parameters) => makeReadRequest(implementation, parameters),
      enumerable: true,
      configurable: false,
      writable: false,
    }),
  ) as EnsReadAction<Parameters, Success, Failure>;
};

export const executeReadRequest = <Success, Failure>(
  request: EnsReadRequest<Success, Failure>,
  config: EnsforgeConfig,
): Effect.Effect<Success, Failure> =>
  (request as InternalEnsReadRequest<Success, Failure>)[EnsReadRequestEffectTypeId](config);
