import type { Request } from "../../Types.js";
import type { Implementation } from "./promise.js";

/**
 * Builds `fn.request`: plain data that `Actions.batch` runs later. The implementation is only used
 * to carry its value and error types.
 */
export const request =
  <options, value, error>(path: string, _implementation: Implementation<options, value, error>) =>
  (options: options): Request<value, error> =>
    Object.freeze({ path, options });
