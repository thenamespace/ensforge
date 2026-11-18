/**
 * A namespace re-export, tagged where it is re-exported.
 *
 * @stability stable
 */
export * as Lookup from "./lookup.js";

export * as Untagged from "./untagged.js";

export { renamed as alias, unknownStage } from "./lookup.js";

/**
 * A re-export tagged on its statement, as third-party re-exports are.
 *
 * @stability unstable
 */
export { external } from "./external.js";
