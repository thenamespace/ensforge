import { Schema } from "effect";

import { ConfigError } from "../errors/config-error.js";

const PositiveNumber = Schema.Number.check(Schema.isGreaterThan(0));

const NonNegativeInteger = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));

export const SimulationPolicy = Schema.Literals(["required", "skip"]);
export type SimulationPolicy = typeof SimulationPolicy.Type;

export const ConfirmationPolicy = Schema.Union([
  Schema.Struct({ type: Schema.Literal("submitted") }),
  Schema.Struct({
    type: Schema.Literal("confirmed"),
    confirmations: Schema.optional(PositiveNumber),
    timeout: Schema.optional(PositiveNumber),
  }),
]);
export type ConfirmationPolicy = typeof ConfirmationPolicy.Type;

const WriteOptionsSchema = Schema.Struct({
  simulation: Schema.optional(SimulationPolicy),
  confirmation: Schema.optional(ConfirmationPolicy),
  statusRetries: Schema.optional(NonNegativeInteger),
});

export interface WriteOptions {
  readonly simulation?: SimulationPolicy;
  readonly confirmation?: ConfirmationPolicy;
  readonly statusRetries?: number;
}

export interface ResolvedWriteOptions {
  readonly simulation: SimulationPolicy;
  readonly confirmation: ConfirmationPolicy;
  readonly statusRetries: number;
}

export const defaultWriteOptions: ResolvedWriteOptions = Object.freeze({
  simulation: "required",
  confirmation: Object.freeze({ type: "confirmed" }),
  statusRetries: 0,
});

export const resolveWriteOptions = (options: WriteOptions | undefined): ResolvedWriteOptions => {
  if (options !== undefined && !Schema.is(WriteOptionsSchema)(options)) {
    throw new ConfigError({
      code: "INVALID_WRITE_OPTIONS",
      message: "Write options contain an invalid policy value",
    });
  }

  return Object.freeze({
    simulation: options?.simulation ?? defaultWriteOptions.simulation,
    confirmation: Object.freeze(options?.confirmation ?? defaultWriteOptions.confirmation),
    statusRetries: options?.statusRetries ?? defaultWriteOptions.statusRetries,
  });
};
