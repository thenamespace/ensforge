import * as ts from "typescript/unstable/ast";

/** Whether a declaration statement carries `export`. */
export const isExported = (node: {
  readonly modifiers?: readonly ts.Node[] | undefined;
}): boolean =>
  node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

/** The JSDoc block right before `node`, verbatim, or `undefined` when it has none. */
export const jsdocBlockOf = (node: ts.Node, source: ts.SourceFile): string | undefined => {
  const last = (ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? []).at(-1);
  const raw = last === undefined ? "" : source.text.slice(last.pos, last.end);
  return raw.startsWith("/**") ? raw : undefined;
};

/** The text of a JSDoc block, without `/**` and leading `*`. */
export const jsdocText = (block: string): string =>
  block
    .replace(/^\/\*\*\s?/, "")
    .replace(/\s*\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, ""))
    .join("\n");

/** The text of the JSDoc block right before `node`. */
export const jsdocOf = (node: ts.Node, source: ts.SourceFile): string | undefined => {
  const block = jsdocBlockOf(node, source);
  return block === undefined ? undefined : jsdocText(block);
};
