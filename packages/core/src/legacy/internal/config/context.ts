import { Effect, Layer, type Context } from "effect";

import type { EnsforgeConfig } from "../../config/config.js";
import type { EnsforgeServices } from "../services/context.js";

const EnsforgeConfigContextTypeId: unique symbol = Symbol.for(
  "@ensforge/core/EnsforgeConfig/context",
);

export const attachConfigContext = <Config extends EnsforgeConfig>(
  config: Config,
  context: Context.Context<EnsforgeServices>,
): Config =>
  Object.defineProperty(config, EnsforgeConfigContextTypeId, {
    value: context,
    enumerable: false,
    configurable: false,
    writable: false,
  });

export const getConfigContext = (config: EnsforgeConfig): Context.Context<EnsforgeServices> =>
  (
    config as EnsforgeConfig & {
      readonly [EnsforgeConfigContextTypeId]: Context.Context<EnsforgeServices>;
    }
  )[EnsforgeConfigContextTypeId];

export const provideConfig = <Success, Failure, Requirements>(
  config: EnsforgeConfig,
  effect: Effect.Effect<Success, Failure, Requirements>,
): Effect.Effect<Success, Failure, Exclude<Requirements, EnsforgeServices>> =>
  Effect.provide(effect, getConfigContext(config));

export const getConfigLayer = (config: EnsforgeConfig): Layer.Layer<EnsforgeServices> =>
  Layer.succeedContext(getConfigContext(config));
