/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string, effecttsgo/prefer-effect-record, effecttsgo/global-json -- synchronous formatting of plain JSON-like values, where native methods read more directly than curried Effect ones */
const identifier = /^[A-Za-z_$][\w$]*$/;

/** A value as the TypeScript literal a reader would write: bigints as `1_000n`, unquoted keys. */
export const literal = (value: unknown): string => {
  if (typeof value === "bigint") return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "_")}n`;
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{ ${entries
      .map(
        ([key, entry]) => `${identifier.test(key) ? key : JSON.stringify(key)}: ${literal(entry)}`,
      )
      .join(", ")} }`;
  }
  return JSON.stringify(value);
};

/** The code line that calls an action on a client, as shown above its example response. */
export const callLine = (path: string, options: unknown): string =>
  `await ens.${path}(${literal(options)})`;
