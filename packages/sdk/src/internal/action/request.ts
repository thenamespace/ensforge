import type { Effect } from "effect";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Request } from "../../Types.js";
import type { Implementation } from "./promise.js";

/**
 * Where a request keeps its implementation. A symbol key stays out of serialization and equality
 * of the request's data, and lets `Actions.batch` run reads that no table of the sdk lists, such
 * as those of extension packages (`@ensforge/hca`).
 */
const implementationKey = Symbol.for("ensforge.request.implementation");

/**
 * The implementation `fn.request` captured, when the request was built by one.
 *
 * @stability unstable
 */
export const implementationOf = (
  request: Request,
): ((client: Client, options: never) => Effect.Effect<unknown, AnyError>) | undefined =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the key is only ever set by `request` below
  (request as { readonly [implementationKey]?: Implementation<never, unknown, AnyError> })[
    implementationKey
  ];

/**
 * Builds `fn.request`: plain data that `Actions.batch` runs later. The implementation also types
 * the request's value and errors, and is what `Actions.batch` runs for reads outside the sdk.
 *
 * @stability unstable
 */
export const request =
  <options, value, error>(path: string, implementation: Implementation<options, value, error>) =>
  // Options stay optional for actions whose options are (`indexer.getStatus`).
  (...[options]: undefined extends options ? [options?] : [options]): Request<value, error> =>
    Object.freeze({ path, options: options ?? {}, [implementationKey]: implementation });
