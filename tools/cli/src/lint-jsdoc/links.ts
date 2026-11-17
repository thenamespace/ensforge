import { SymbolFlags, type Symbol as TsSymbol } from "typescript/unstable/sync";

import type { Project } from "../services/TypeScript.ts";

const meaning = SymbolFlags.Value | SymbolFlags.Type | SymbolFlags.Namespace | SymbolFlags.Alias;

/**
 * Every dotted path the entries export (`Actions.record.get`, `Errors.InvalidInputError`,
 * `getText.Options`), so links may name public API from files that do not import it.
 */
export const exportedPaths = (
  project: Project,
  entries: readonly string[],
): ReadonlySet<string> => {
  const { checker } = project;
  const paths = new Set<string>();
  const seen = new Set<TsSymbol>();

  const walk = (prefix: string, symbols: Iterable<TsSymbol>) => {
    for (const exported of symbols) {
      const path = prefix === "" ? exported.name : `${prefix}.${exported.name}`;
      paths.add(path);
      const symbol =
        (exported.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(exported) : exported;
      if (seen.has(symbol)) continue;
      seen.add(symbol);
      if ((symbol.flags & (SymbolFlags.ValueModule | SymbolFlags.NamespaceModule)) !== 0)
        walk(path, symbol.getExports().values());
    }
  };

  for (const entry of entries) {
    const module = checker.getSymbolAtLocation(project.sourceFile(entry));
    if (module !== undefined) walk("", checker.getExportsOfModule(module));
  }
  return paths;
};

/** A link target (`Actions.record.get`, `getText.Options`) resolved from a position in a file. */
const resolvesAt = (project: Project, file: string, position: number, target: string): boolean => {
  const { checker } = project;
  const [first = "", ...rest] = target.split(".");
  let symbol = checker.resolveName(first, meaning, { document: file, position }, false);

  for (const segment of rest) {
    if (symbol === undefined) return false;
    const resolved =
      (symbol.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
    // Properties of a value's type (`ens.record`) or of a declared type (`Options.name`).
    const type =
      (resolved.flags & SymbolFlags.Type) !== 0
        ? checker.getDeclaredTypeOfSymbol(resolved)
        : checker.getTypeOfSymbol(resolved);
    symbol =
      resolved.getExports().get(segment as never) ??
      resolved.getMembers().get(segment as never) ??
      checker.getPropertyOfType(type ?? checker.getAnyType(), segment);
  }
  return symbol !== undefined;
};

/** `{@link …}` targets in a file's doc comments that resolve to nothing. */
export const brokenLinks = (
  project: Project,
  file: string,
  exported: ReadonlySet<string>,
): string[] => {
  const { text } = project.sourceFile(file);
  const problems: string[] = [];

  for (const comment of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    // Names resolve in the scope that follows the comment (e.g. inside a namespace).
    const position = (comment.index ?? 0) + comment[0].length;
    for (const link of comment[0].matchAll(/\{@link(?:code|plain)?\s+([^\s|}]+)/g)) {
      const target = link[1] ?? "";
      if (target.includes("://") || exported.has(target)) continue;
      if (!resolvesAt(project, file, position, target)) problems.push(`broken {@link ${target}}`);
    }
  }
  return problems;
};
