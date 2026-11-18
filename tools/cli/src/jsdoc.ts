import { Array as Arr, Option, String as Str } from "effect";

import * as ts from "typescript/unstable/ast";

/** Whether a declaration statement carries `export`. */
export const isExported = (node: {
  readonly modifiers?: readonly ts.Node[] | undefined;
}): boolean =>
  node.modifiers !== undefined &&
  Arr.some(node.modifiers, (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

/** The JSDoc block right before `node`, verbatim, or `undefined` when it has none. */
export const jsdocBlockOf = (node: ts.Node, source: ts.SourceFile): string | undefined => {
  // Line comments may sit between the block and the node: lint directives
  // (`// oxlint-disable-next-line …`, `// @effect-diagnostics-next-line …`) and their reasons.
  const last = Arr.findLast(
    ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? [],
    (range) => range.kind !== ts.SyntaxKind.SingleLineCommentTrivia,
  );
  const raw = Option.match(last, {
    onNone: () => "",
    onSome: (range) => Str.slice(range.pos, range.end)(source.text),
  });
  return Str.startsWith("/**")(raw) ? raw : undefined;
};

/** The text of a JSDoc block, without `/**` and leading `*`. */
export const jsdocText = (block: string): string =>
  Arr.join(
    Arr.map(
      Str.split(Str.replace(/\s*\*\/$/, "")(Str.replace(/^\/\*\*\s?/, "")(block)), "\n"),
      (line) => Str.replace(/^\s*\* ?/, "")(line),
    ),
    "\n",
  );

/** The text of the JSDoc block right before `node`. */
export const jsdocOf = (node: ts.Node, source: ts.SourceFile): string | undefined => {
  const block = jsdocBlockOf(node, source);
  return block === undefined ? undefined : jsdocText(block);
};
