import { HcaError } from "@ensforge/core/legacy";

import type { ExecutionExtensions } from "./types.js";

/** Check required extensions before preparing a workflow or prompting its signer. */
export const requireExecutionExtension = <E extends ExecutionExtensions, K extends keyof E>(
  adapter: { readonly extensions: E },
  name: K,
): NonNullable<E[K]> => {
  const extension = adapter.extensions[name];

  if (extension === undefined || extension === null)
    throw new HcaError({
      code: "UNSUPPORTED_CAPABILITY",
      message: `Execution extension ${String(name)} is unavailable`,
    });

  return extension;
};
