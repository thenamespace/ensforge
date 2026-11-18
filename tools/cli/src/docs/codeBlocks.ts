/* oxlint-disable effecttsgo/prefer-effect-array, effecttsgo/prefer-effect-string -- synchronous text scanning of Markdown, where native string and array methods read more directly than curried Effect ones */
import { toModule } from "../examples/extract.ts";

/** One checkable file of a docs code block. */
export type BlockFile = { readonly name: string; readonly code: string };

export type CodeBlock = {
  readonly line: number;
  readonly extension: "ts" | "tsx";
  readonly files: readonly BlockFile[];
};

/**
 * Opt out of the type-check with ```` ```ts no-check ```` (or `noCheck`): use it for code that is
 * deliberately incomplete, for the "before" half of a migration, and for code that needs a
 * package the docs app does not install. A block containing `// @noErrors` is skipped too.
 */
const optsOut = (meta: string, code: string): boolean =>
  /(^|\s)(no-check|noCheck)(\s|$)/.test(meta) || /^\s*\/\/\s*@noErrors\b/m.test(code);

/**
 * Splits a block on `// @filename: x` markers into files, dropping the twoslash-only lines:
 * `// ^?` queries, `// ---cut---` markers (everything compiles) and other `// @flag` directives.
 */
export const filesOf = (code: string, defaultName: string): BlockFile[] => {
  const files: { name: string; lines: string[] }[] = [{ name: defaultName, lines: [] }];

  for (const line of code.split("\n")) {
    const filename = /^\s*\/\/\s*@filename:\s*(\S+)\s*$/.exec(line);
    if (filename !== null) {
      const current = files.at(-1);
      if (current !== undefined && current.lines.every((text) => text.trim() === "")) {
        current.name = filename[1] ?? defaultName;
      } else files.push({ name: filename[1] ?? defaultName, lines: [] });
      continue;
    }
    if (/^\s*\/\/\s*\^\?/.test(line)) continue;
    if (/^\s*\/\/\s*---cut[\w-]*---\s*$/.test(line)) continue;
    if (/^\s*\/\/\s*@[a-zA-Z]+\b/.test(line)) continue;
    files.at(-1)?.lines.push(line);
  }

  return files
    .filter((file) => file.lines.some((text) => text.trim() !== ""))
    .map((file) => ({ name: file.name, code: file.lines.join("\n") }));
};

/** The ```ts and ```tsx fences of a Markdown body that are not opted out. */
export const blocksOf = (body: string): CodeBlock[] => {
  const blocks: CodeBlock[] = [];
  const lines = body.split("\n");
  let open:
    | { language: string; meta: string; line: number; indent: number; code: string[] }
    | undefined;

  for (const [index, line] of lines.entries()) {
    if (open === undefined) {
      const fence = /^(\s*)```(\w+)?(.*)$/.exec(line);
      if (fence !== null)
        open = {
          language: fence[2] ?? "",
          meta: fence[3] ?? "",
          line: index + 1,
          indent: (fence[1] ?? "").length,
          code: [],
        };
      continue;
    }
    if (/^\s*```\s*$/.test(line)) {
      const code = open.code.join("\n");
      if ((open.language === "ts" || open.language === "tsx") && !optsOut(open.meta, code)) {
        const extension = open.language;
        const files = filesOf(code, `block.${extension}`);
        if (files.length > 0) blocks.push({ line: open.line, extension, files });
      }
      open = undefined;
      continue;
    }
    open.code.push(line.slice(Math.min(open.indent, line.length - line.trimStart().length)));
  }
  return blocks;
};

/**
 * The module written for a file. A single-file block is wrapped like a JSDoc example, so both
 * `await` and `yield*` type-check. Files of a multi-file block, and blocks with their own
 * top-level `declare` or `export`, stay as written (with `export {}` making each a module).
 */
export const moduleOf = (code: string, multiFile: boolean): string =>
  multiFile || /^(declare|export)\s/m.test(code) ? `${code}\n\nexport {};\n` : toModule(code);
