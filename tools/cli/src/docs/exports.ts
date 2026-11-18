import { Array as Arr, Option, Order, String as Str } from "effect";

import * as ts from "typescript/unstable/ast";
import { SymbolFlags, type Symbol as TsSymbol } from "typescript/unstable/sync";

import { jsdocOf } from "../jsdoc.ts";
import { isNamespace, stabilityOf } from "../lint-jsdoc/stability.ts";
import type { Project } from "../services/TypeScript.ts";
import { isWorkspaceFile, membersOf, textOf } from "./members.ts";
import type { ExportDoc, SourceLocation } from "./model.ts";
import { sectionsOf } from "./sections.ts";

/** Where `node` starts (after its JSDoc), as a path from the repository root and a 1-based line. */
export const sourceOf = (node: ts.Node): SourceLocation => {
  const source = node.getSourceFile();
  return {
    file: Str.replace(/^.*?\/(?=packages\/)/, "")(source.fileName),
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  };
};

/** The statement a declaration's JSDoc sits on: `export const a = …` documents `a`. */
const statementOf = (declaration: ts.Node): ts.Node =>
  ts.isVariableDeclaration(declaration) ? declaration.parent.parent : declaration;

const withoutExport = (text: string): string =>
  Str.replace(/^export\s+(declare\s+)?(default\s+)?/, "")(text);

/** A signature as written: parameters and return type, without the body. */
const signatureOf = (name: string, declaration: ts.Node): string => {
  if (ts.isFunctionDeclaration(declaration)) {
    const source = declaration.getSourceFile();
    const end =
      declaration.body === undefined ? declaration.getEnd() : declaration.body.getStart(source);
    return withoutExport(
      Str.trim(
        Str.replaceAll(/\s+/g, " ")(Str.slice(declaration.getStart(source), end)(source.text)),
      ),
    );
  }
  if (ts.isVariableDeclaration(declaration)) {
    if (declaration.type !== undefined) return `const ${name}: ${textOf(declaration.type)}`;
    const initializer = declaration.initializer;
    if (
      initializer !== undefined &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ) {
      const typeParameters =
        initializer.typeParameters === undefined
          ? ""
          : `<${Arr.join(Arr.map(initializer.typeParameters, textOf), ", ")}>`;
      const parameters = Arr.join(Arr.map(initializer.parameters, textOf), ", ");
      const returns = initializer.type === undefined ? "" : `: ${textOf(initializer.type)}`;
      return `function ${name}${typeParameters}(${parameters})${returns}`;
    }
    return "";
  }
  if (ts.isTypeAliasDeclaration(declaration) && !ts.isTypeLiteralNode(declaration.type))
    return withoutExport(textOf(declaration));
  // Object types, interfaces and classes show their members as a table instead.
  if (
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isClassDeclaration(declaration)
  ) {
    const keyword = ts.isTypeAliasDeclaration(declaration)
      ? "type"
      : ts.isInterfaceDeclaration(declaration)
        ? "interface"
        : "class";
    const parameters =
      declaration.typeParameters === undefined
        ? ""
        : `<${Arr.join(Arr.map(declaration.typeParameters, textOf), ", ")}>`;
    return `${keyword} ${name}${parameters}`;
  }
  return "";
};

const kindOf = (symbol: TsSymbol): ExportDoc["kind"] | undefined => {
  if ((symbol.flags & SymbolFlags.Class) !== 0) return "class";
  if ((symbol.flags & SymbolFlags.Function) !== 0) return "function";
  if ((symbol.flags & SymbolFlags.Variable) !== 0) return "const";
  if ((symbol.flags & SymbolFlags.Interface) !== 0) return "interface";
  if ((symbol.flags & SymbolFlags.TypeAlias) !== 0) return "type";
  return undefined;
};

/**
 * Every documented export of an entry module, walking into namespaces (`export * as Name`) and
 * the types merged with functions (`fromWagmi.Options`), sorted by path. Signatures are the
 * declarations as written; object types list their members.
 */
export const exportDocs = (project: Project, file: string): readonly ExportDoc[] => {
  const { checker } = project;
  const docs: ExportDoc[] = [];
  const seen = new Set<TsSymbol>();

  const walk = (prefix: string, symbols: Iterable<TsSymbol>, inherited?: string) => {
    for (const exported of symbols) {
      const symbol =
        (exported.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(exported) : exported;
      const path = prefix === "" ? exported.name : `${prefix}.${exported.name}`;
      if (seen.has(symbol)) continue;
      seen.add(symbol);

      if (isNamespace(symbol)) {
        walk(path, checker.getExportsOfModule(symbol), stabilityOf(checker, exported)?.value);
        continue;
      }

      const stability = stabilityOf(checker, exported)?.value ?? inherited ?? "stable";
      const declaration = Option.getOrUndefined(
        Arr.findFirst(
          Arr.flatMap(symbol.declarations, (handle) => {
            const node = handle.resolve();
            return node === undefined ? [] : [node];
          }),
          (node) => !ts.isModuleDeclaration(node) && !ts.isSourceFile(node),
        ),
      );
      const kind = kindOf(symbol);
      if (declaration !== undefined && kind !== undefined) {
        const source = declaration.getSourceFile();
        const isType = kind === "type" || kind === "interface" || kind === "class";
        const members =
          isType &&
          (kind !== "type" ||
            (ts.isTypeAliasDeclaration(declaration) && ts.isTypeLiteralNode(declaration.type)) ||
            (ts.isTypeAliasDeclaration(declaration) && ts.isIntersectionTypeNode(declaration.type)))
            ? Arr.filter(membersOf(project, checker.getDeclaredTypeOfSymbol(symbol)), (member) =>
                isWorkspaceFile(member.file),
              )
            : [];
        docs.push({
          path,
          kind,
          stability,
          doc: sectionsOf(jsdocOf(statementOf(declaration), source) ?? ""),
          signature: signatureOf(exported.name, declaration),
          members,
          source: sourceOf(statementOf(declaration)),
        });
      }
      // Types declared in a function's namespace (`fromWagmi.Options`).
      if ((symbol.flags & SymbolFlags.NamespaceModule) !== 0)
        walk(path, symbol.getExports().values(), stability);
    }
  };

  const module = checker.getSymbolAtLocation(project.sourceFile(file));
  if (module !== undefined) walk("", checker.getExportsOfModule(module));
  return Arr.sort(
    docs,
    Order.mapInput(Order.String, (entry: ExportDoc) => entry.path),
  );
};
