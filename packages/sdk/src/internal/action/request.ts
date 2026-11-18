import type { Request } from "../../Types.js";
import type { Implementation } from "./promise.js";

/**
 * Builds `fn.request`: plain data that `Actions.batch` runs later. The implementation is only used
 * to carry its value and error types.
 *
 * @stability unstable
 */
export const request =
  <options, value, error>(path: string, _implementation: Implementation<options, value, error>) =>
  // Options stay optional for actions whose options are (`indexer.getStatus`).
  (...[options]: undefined extends options ? [options?] : [options]): Request<value, error> =>
    Object.freeze({ path, options: options ?? {} });
