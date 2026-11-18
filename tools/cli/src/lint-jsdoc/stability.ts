import { String as Str, Array as Arr } from "effect";

import * as ts from "typescript/unstable/ast";
import { SymbolFlags, type Checker, type Symbol as TsSymbol } from "typescript/unstable/sync";

import { jsdocBlockOf, jsdocText } from "../jsdoc.ts";
import type { Project } from "../services/TypeScript.ts";

/** The `@stability` values, and what each promises under semver (see CONTRIBUTING.md). */
export const stabilities = ["stable", "experimental", "unstable"] as const;

/** The `@stability` tag that applies to an export, and the file it is written in. */
export type StabilityTag = { readonly value: string; readonly file: string };

/** Namespaces walked for their members: re-exported modules and plain namespaces. */
export const isNamespace = (symbol: TsSymbol): boolean =>
  (symbol.flags & (SymbolFlags.ValueModule | SymbolFlags.NamespaceModule)) !== 0 &&
  (symbol.flags & (SymbolFlags.Function | SymbolFlags.Class | SymbolFlags.Variable)) === 0;

const tagOfDeclaration = (declaration: ts.Node): StabilityTag | undefined => {
  if (ts.isSourceFile(declaration)) return undefined;
  // JSDoc sits on the statement: `export const a = …`, `export { a } from`, `export * as a from`.
  const statement = ts.isVariableDeclaration(declaration)
    ? declaration.parent.parent
    : ts.isExportSpecifier(declaration)
      ? declaration.parent.parent
      : ts.isNamespaceExport(declaration)
        ? declaration.parent
        : declaration;
  const source = statement.getSourceFile();
  const block = jsdocBlockOf(statement, source);
  const value = /^@stability\b[ \t]*(.*)$/m.exec(block === undefined ? "" : jsdocText(block))?.[1];
  return value === undefined ? undefined : { value: Str.trim(value), file: source.fileName };
};

/**
 * The tag of an export: the nearest one along its alias chain, from the re-export statement the
 * entry reaches it through to its declaration. A tag on `export { a } from "…"` covers `a`, which
 * is how third-party re-exports are tagged.
 */
export const stabilityOf = (checker: Checker, exported: TsSymbol): StabilityTag | undefined => {
  let symbol: TsSymbol | undefined = exported;
  while (symbol !== undefined) {
    for (const handle of symbol.declarations) {
      const declaration = handle.resolve();
      const tag = declaration === undefined ? undefined : tagOfDeclaration(declaration);
      if (tag !== undefined) return tag;
    }
    symbol =
      (symbol.flags & SymbolFlags.Alias) !== 0
        ? checker.getImmediateAliasedSymbol(symbol)
        : undefined;
  }
  return undefined;
};

/**
 * Where a missing tag belongs: the export's declaration, or for a namespace re-export or a
 * dependency's export, the last re-export statement in the package.
 */
const tagSiteOf = (checker: Checker, exported: TsSymbol): string | undefined => {
  let site: string | undefined;
  let symbol: TsSymbol | undefined = exported;
  while (symbol !== undefined) {
    const declaration = symbol.declarations[0]?.resolve();
    if (
      declaration !== undefined &&
      !ts.isSourceFile(declaration) &&
      !Str.includes("/node_modules/")(declaration.getSourceFile().fileName)
    )
      site = declaration.getSourceFile().fileName;
    symbol =
      (symbol.flags & SymbolFlags.Alias) !== 0
        ? checker.getImmediateAliasedSymbol(symbol)
        : undefined;
  }
  return site;
};

/**
 * Exports reachable from the entries without a valid `@stability` tag, walking into namespaces
 * (`export * as Errors`): each namespace and each of its members needs one. Types declared in a
 * function's namespace (`getText.Options`) share the function's tag.
 */
export const untaggedExports = (
  project: Project,
  entries: readonly { readonly name: string; readonly source: string }[],
): readonly [file: string, message: string][] => {
  const { checker } = project;
  const problems = new Map<string, [string, string]>();
  const seen = new Set<TsSymbol>();

  const walk = (entry: string, prefix: string, symbols: Iterable<TsSymbol>) => {
    for (const exported of symbols) {
      const path = prefix === "" ? exported.name : `${prefix}.${exported.name}`;
      const symbol =
        (exported.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(exported) : exported;
      const tag = stabilityOf(checker, exported);

      if (tag === undefined) {
        const file = tagSiteOf(checker, exported) ?? entry;
        problems.set(`${file}:${path}`, [
          file,
          `${path} (from ${entry}) has no @stability tag (${Arr.join(stabilities, ", ")})`,
        ]);
      } else if (!(stabilities as readonly string[]).includes(tag.value)) {
        problems.set(`${tag.file}:${path}`, [
          tag.file,
          `${path} (from ${entry}) has \`@stability ${tag.value}\`; use ${Arr.join(stabilities, ", ")}`,
        ]);
      }

      if (!isNamespace(symbol) || seen.has(symbol)) continue;
      seen.add(symbol);
      walk(entry, path, checker.getExportsOfModule(symbol));
    }
  };

  for (const entry of entries) {
    const module = checker.getSymbolAtLocation(project.sourceFile(entry.source));
    if (module !== undefined) walk(entry.name, "", checker.getExportsOfModule(module));
  }
  return [...problems.values()];
};
