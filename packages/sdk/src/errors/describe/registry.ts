import { Record as Rec } from "effect";

import type { EnsforgeError } from "../EnsforgeError.js";
import type { Copy } from "./messages.js";

/** A package's copy for one code; `describe` passes it only errors with that code. */
export type Template = (error: EnsforgeError) => Copy;

/**
 * Copy that packages extending ensforge register for their codes. It lives apart from
 * `describe` and the sdk's own copy, so registering does not pull either into a bundle.
 */
export const extensionMessages = new Map<string, Template>();

/**
 * Adds the end-user copy of a package's error codes to `Errors.describe`. Call it once, next to
 * the error class, so the copy is registered wherever the class can be thrown. The sdk's own
 * codes keep their copy: `describe` looks them up first.
 *
 * @internal
 * @stability unstable
 */
export const registerMessages = <error extends EnsforgeError>(table: {
  readonly [code in error["code"]]: (error: error) => Copy;
}): void => {
  for (const [code, template] of Rec.toEntries(table))
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `describe` passes the template only errors with its code
    extensionMessages.set(code, template as Template);
};
