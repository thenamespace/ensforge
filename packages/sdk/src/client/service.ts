import { Context, Effect, Layer } from "effect";

import type { ConfigError } from "../errors/classes/ConfigError.js";
import { create } from "./create.js";
import type { Client, CreateOptions } from "./types.js";

/**
 * The ensforge client as an Effect service.
 *
 * **Example** (Providing and using the client)
 *
 * ```ts
 * import { Effect } from "effect"
 * import { Actions, Ensforge } from "@ensforge/sdk/effect"
 *
 * const program = Effect.gen(function* () {
 *   const ens = yield* Ensforge.Ensforge
 *   return yield* Actions.record.getText(ens, { name: "nick.eth", key: "url" })
 * })
 *
 * await Effect.runPromise(program.pipe(Effect.provide(Ensforge.layer({ publicClient }))))
 * ```
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export class Ensforge extends Context.Service<Ensforge, Client<object>>()(
  // Public key (`<package>/<Service>`); this file is not named after the service.
  // oxlint-disable-next-line effecttsgo/deterministic-keys
  "@ensforge/sdk/Ensforge",
) {}

/**
 * A layer that creates the client with `Ensforge.create`.
 *
 * @stability stable
 * @category client
 * @since 1.0.0
 */
export const layer = (options: CreateOptions): Layer.Layer<Ensforge, ConfigError> =>
  Layer.effect(
    Ensforge,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `create` throws only `ConfigError`
    Effect.try({ try: () => create(options), catch: (error) => error as ConfigError }),
  );
