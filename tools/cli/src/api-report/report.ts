import { Array as Arr, Order, Predicate, String as Str } from "effect";

import { SyntaxKind } from "typescript/unstable/ast";
import {
  NodeBuilderFlags,
  SignatureKind,
  SymbolFlags,
  type Signature,
  type Symbol as TsSymbol,
} from "typescript/unstable/sync";

import { isNamespace, stabilityOf } from "../lint-jsdoc/stability.ts";
import type { Project } from "../services/TypeScript.ts";
import { formatAbiItem, isAbi } from "./abi.ts";

// TypeFormatFlags (TypeScript 7 does not export the enum): NoTruncation | InTypeAlias |
// UseSingleQuotesForStringLiteralType | WriteArrowStyleSignature.
const typeFlags = 1 | 8_388_608 | 268_435_456 | 262_144;

const valueAt = (module: unknown, path: string): unknown =>
  Arr.reduce(Str.split(path, "."), module, (value, key) =>
    Predicate.hasProperty(value, key) ? value[key] : undefined,
  );

/**
 * Every export of a declaration file, walking into namespaces (`export * as Errors`), with its
 * signature and, unless stable, its `@stability`. `runtime` is the built module, so ABIs print as
 * one signature per line.
 */
export const renderReport = (project: Project, file: string, runtime: unknown): string => {
  const { checker } = project;
  const source = project.sourceFile(file);
  const lines: string[] = [];
  const seen = new Set<TsSymbol>();

  const typeText = (symbol: TsSymbol) =>
    checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, source), undefined, typeFlags);
  // `(…) => …`, on one line, as TypeScript 6's signatureToString printed it.
  const signatureText = (signature: Signature) => {
    const node = checker.signatureToSignatureDeclaration(
      signature,
      SyntaxKind.FunctionType,
      undefined,
      NodeBuilderFlags.NoTruncation |
        NodeBuilderFlags.InTypeAlias |
        NodeBuilderFlags.UseSingleQuotesForStringLiteralType |
        NodeBuilderFlags.IgnoreErrors,
    );
    return node === undefined ? "" : Str.replaceAll(/\s*\n\s*/g, " ")(project.print(node));
  };
  const resolve = (symbol: TsSymbol) =>
    (symbol.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

  const describeType = (path: string, symbol: TsSymbol) => {
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    if ((symbol.flags & SymbolFlags.Interface) !== 0) {
      const members = Arr.map(
        checker.getPropertiesOfType(type),
        (member) =>
          `  ${member.name}${(member.flags & SymbolFlags.Optional) !== 0 ? "?" : ""}: ${typeText(member)}`,
      );
      lines.push(`interface ${path} {`, ...members, "}");
      return;
    }
    lines.push(`type ${path} = ${checker.typeToString(type, undefined, typeFlags)}`);
  };

  const describeValue = (path: string, symbol: TsSymbol) => {
    const type = checker.getTypeOfSymbolAtLocation(symbol, source);
    if ((symbol.flags & SymbolFlags.Class) !== 0) {
      const members = Arr.map(
        Arr.filter(
          checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol)),
          (member) => !Str.startsWith("#")(member.name),
        ),
        (member) => `  ${member.name}: ${typeText(member)}`,
      );
      const constructors = Arr.map(
        checker.getSignaturesOfType(type, SignatureKind.Construct),
        (signature) => `  constructor${signatureText(signature)}`,
      );
      lines.push(`class ${path} {`, ...constructors, ...members, "}");
      return;
    }

    const value = valueAt(runtime, path);
    if (isAbi(value)) {
      lines.push(`const ${path}: Abi`, ...Arr.map(value, (item) => `  ${formatAbiItem(item)}`));
      return;
    }

    const signatures = checker.getSignaturesOfType(type, SignatureKind.Call);
    if (signatures.length === 0) {
      lines.push(`const ${path}: ${checker.typeToString(type, undefined, typeFlags)}`);
      return;
    }
    for (const signature of signatures) lines.push(`function ${path}${signatureText(signature)}`);
    // Function properties such as `set.prepare`; expando assignments are walked as exports.
    for (const property of checker.getPropertiesOfType(type)) {
      if (symbol.getExports().has(property.escapedName)) continue;
      lines.push(`const ${path}.${property.name}: ${typeText(property)}`);
    }
  };

  // `inherited`: the tag of the function or class whose namespace is walked (`getText.Options`).
  const walk = (prefix: string, symbols: Iterable<TsSymbol>, inherited?: string) => {
    const byName = Order.make<TsSymbol>((a, b) => Str.localeCompare(b.name)(a.name));
    for (const exported of Arr.sort([...symbols], byName)) {
      const symbol = resolve(exported);
      const path = prefix === "" ? exported.name : `${prefix}.${exported.name}`;

      if (isNamespace(symbol)) {
        if (seen.has(symbol)) {
          lines.push(`namespace ${path} = (see above)`);
          continue;
        }
        seen.add(symbol);
        walk(path, checker.getExportsOfModule(symbol));
        continue;
      }

      const stability = stabilityOf(checker, exported)?.value ?? inherited ?? "untagged";
      if (stability !== (inherited ?? "stable")) lines.push(`// @stability ${stability}`);
      if ((symbol.flags & (SymbolFlags.Function | SymbolFlags.Class | SymbolFlags.Variable)) !== 0)
        describeValue(path, symbol);
      if ((symbol.flags & (SymbolFlags.Interface | SymbolFlags.TypeAlias)) !== 0)
        describeType(path, symbol);
      // Type-only namespaces merged with values (e.g. `getText.Options`).
      if ((symbol.flags & SymbolFlags.NamespaceModule) !== 0)
        walk(path, symbol.getExports().values(), stability);
    }
  };

  const module = checker.getSymbolAtLocation(source);
  if (module !== undefined) walk("", checker.getExportsOfModule(module));

  // Types outside the entry's scope print as `import("/abs/path").Name`; keep only the name.
  // Unique-symbol keys print with a compiler-internal id (`__@name@123`) that changes between runs.
  return Str.replaceAll(
    /__@(\w+)@\d+/g,
    "[$1]",
  )(Str.replaceAll(/import\((["'])[^"']+\1\)\./g, "")(Arr.join(lines, "\n")));
};
