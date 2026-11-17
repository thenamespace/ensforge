import type { Effect, Stream } from "effect";

import type {
  EnsAction,
  ExecuteHcaCallsAction,
  ExecuteHcaCallsParameters,
  PrepareHcaCallsParameters,
  ExecutionAdapter,
  HcaTransactionSubmission,
  HcaExecutionSubmission,
  WatchHcaExecution,
  WaitForHcaExecutionParameters,
  HcaExecutionStatus,
  WriteError,
  EnsNoParametersAction,
  EnsReadAction,
  EnsReadRequest,
  EnsforgeConfig,
  EnsWriteAction,
  EnsWriteIntent,
} from "@ensforge/core/legacy";

type Callable = (...arguments_: never[]) => unknown;

export interface BoundBaseAction<Parameters, Success, Failure> {
  (parameters: Parameters, options?: Effect.RunOptions): Promise<Success>;

  readonly effect: (parameters: Parameters) => Effect.Effect<Success, Failure>;
}

export interface BoundNoParametersAction<Success, Failure> {
  (options?: Effect.RunOptions): Promise<Success>;

  readonly effect: () => Effect.Effect<Success, Failure>;
}

export interface BoundReadAction<Parameters, Success, Failure> extends BoundBaseAction<
  Parameters,
  Success,
  Failure
> {
  readonly request: (parameters: Parameters) => EnsReadRequest<Success, Failure>;
}

export interface BoundWriteAction<Parameters, Success, Failure> extends BoundBaseAction<
  Parameters,
  Success,
  Failure
> {
  readonly call: (parameters: Parameters) => EnsWriteIntent<Success, Failure>;
}

export type BoundAction<Action extends Callable> =
  Action extends EnsNoParametersAction<infer Success, infer Failure>
    ? BoundNoParametersAction<Success, Failure>
    : Action extends EnsReadAction<infer Parameters, infer Success, infer Failure>
      ? BoundReadAction<Parameters, Success, Failure>
      : Action extends EnsWriteAction<infer Parameters, infer Success, infer Failure>
        ? BoundWriteAction<Parameters, Success, Failure>
        : Action extends EnsAction<infer Parameters, infer Success, infer Failure>
          ? BoundBaseAction<Parameters, Success, Failure>
          : never;

export interface BoundExecuteHcaCalls {
  <Adapter extends ExecutionAdapter>(
    parameters: PrepareHcaCallsParameters & { readonly execution: Adapter },
    options?: Effect.RunOptions,
  ): Promise<Awaited<ReturnType<Adapter["submit"]>>>;
  (
    parameters: PrepareHcaCallsParameters & { readonly execution?: never },
    options?: Effect.RunOptions,
  ): Promise<HcaTransactionSubmission>;
  (
    parameters: ExecuteHcaCallsParameters,
    options?: Effect.RunOptions,
  ): Promise<HcaExecutionSubmission>;

  readonly effect: {
    <Adapter extends ExecutionAdapter>(
      parameters: PrepareHcaCallsParameters & { readonly execution: Adapter },
    ): Effect.Effect<Awaited<ReturnType<Adapter["submit"]>>, WriteError>;
    (
      parameters: PrepareHcaCallsParameters & { readonly execution?: never },
    ): Effect.Effect<HcaTransactionSubmission, WriteError>;
    (parameters: ExecuteHcaCallsParameters): Effect.Effect<HcaExecutionSubmission, WriteError>;
  };
}

export interface BoundWatchHcaExecution {
  (
    parameters: WaitForHcaExecutionParameters,
    onStatus: (status: HcaExecutionStatus) => void,
    onError: (error: WriteError) => void,
    options?: Effect.RunOptions,
  ): Promise<() => void>;

  readonly stream: (
    parameters: WaitForHcaExecutionParameters,
  ) => Stream.Stream<HcaExecutionStatus, WriteError>;
}

export function bindAction(
  config: EnsforgeConfig,
  action: ExecuteHcaCallsAction,
): BoundExecuteHcaCalls;
export function bindAction(
  config: EnsforgeConfig,
  action: WatchHcaExecution,
): BoundWatchHcaExecution;
export function bindAction<Action extends Callable>(
  config: EnsforgeConfig,
  action: Action,
): BoundAction<Action>;
export function bindAction(config: EnsforgeConfig, action: Callable): Callable {
  const invoke = action as (...arguments_: ReadonlyArray<unknown>) => unknown;
  const bound = (...arguments_: ReadonlyArray<unknown>) =>
    Reflect.apply(invoke, undefined, [config, ...arguments_]);

  for (const property of ["effect", "stream"] as const) {
    const extension = Reflect.get(action, property);

    if (typeof extension === "function") {
      Object.defineProperty(bound, property, {
        value: (...arguments_: ReadonlyArray<unknown>) =>
          Reflect.apply(extension, action, [config, ...arguments_]),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
  }

  // Descriptors stay unbound so batches can prepare them with their own execution context.
  for (const property of ["request", "call"] as const) {
    const extension = Reflect.get(action, property);

    if (typeof extension === "function") {
      Object.defineProperty(bound, property, {
        value: extension,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
  }

  return Object.freeze(bound);
}
