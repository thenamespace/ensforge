import * as ts from "typescript/unstable/ast";

/** Whether a declaration statement carries `export`. */
export const isExported = (node: {
  readonly modifiers?: readonly ts.Node[] | undefined;
}): boolean =>
  node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

/** The text of the JSDoc block right before `node`, without `/**` and leading `*`. */
export const jsdocOf = (node: ts.Node, source: ts.SourceFile): string | undefined => {
  const last = (ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? []).at(-1);
  const raw = last === undefined ? "" : source.text.slice(last.pos, last.end);
  if (!raw.startsWith("/**")) return undefined;

  return raw
    .replace(/^\/\*\*\s?/, "")
    .replace(/\s*\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, ""))
    .join("\n");
};
