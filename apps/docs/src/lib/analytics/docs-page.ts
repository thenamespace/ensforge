export type DocKind =
  | "guide"
  | "migration"
  | "reference_action"
  | "reference_hook"
  | "reference_error"
  | "reference_other";

/**
 * What kind of docs page this is and, on action, hook and error-code pages, the API it documents
 * (the page title, such as `record.get`, `useAddress` or `NAME_EXPIRED`). `path` is the file under
 * `content/docs` (`sdk/(migrate)/from-ensforge-0x.mdx`); `slugs` is its URL without `/docs`.
 */
export function describeDocsPage(
  path: string,
  slugs: readonly string[],
  title: string,
): { readonly docKind: DocKind; readonly apiName: string | undefined } {
  const docKind = docKindOf(path, slugs);
  const documentsApi =
    docKind === "reference_action" || docKind === "reference_hook" || docKind === "reference_error";

  return { docKind, apiName: documentsApi ? title : undefined };
}

function docKindOf(path: string, slugs: readonly string[]): DocKind {
  if (slugs[0] !== "reference") return path.includes("(migrate)/") ? "migration" : "guide";
  if (/(^|\/)index\.mdx$/.test(path)) return "reference_other";

  const section = slugs[1];
  const leaf = slugs.at(-1) ?? "";

  if (section === "errors" && /^[A-Z0-9_]+$/.test(leaf)) return "reference_error";
  if (section === "react" && leaf.startsWith("use-")) return "reference_hook";
  // Actions sit one folder under their package: `reference/sdk/record/get`.
  if ((section === "sdk" || section === "hca") && slugs.length === 4) return "reference_action";

  return "reference_other";
}
