const handWritten = new Set(["entry-points", "known-limitations", "glossary"]);

/**
 * Where a docs path from before the API reference moved to `/docs/reference` lives now, as slugs:
 * `sdk/reference/actions/record/get` → `reference/sdk/record/get`, `sdk/errors/NOT_OWNER` →
 * `reference/errors/NOT_OWNER` (the `docsUrl` of errors from earlier releases). `undefined` for
 * every other path.
 */
export function movedReference(slugs: readonly string[]): string[] | undefined {
  const [pkg, section, ...rest] = slugs;
  if (pkg === undefined) return undefined;

  if (pkg === "sdk" && section === "errors") return ["reference", "errors", ...rest];
  if (section !== "reference") return undefined;

  const [first, ...tail] = rest;
  if (pkg === "sdk" && first !== undefined && handWritten.has(first)) return ["reference", first];
  // Actions sat in an `actions` folder and hooks in `hooks`; both are now the package's top level.
  if ((first === "actions" && pkg !== "react") || (first === "hooks" && pkg === "react"))
    return ["reference", pkg, ...tail];

  return ["reference", pkg, ...rest];
}
