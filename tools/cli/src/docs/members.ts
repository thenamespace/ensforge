import { Array as Arr, String as Str } from "effect";

import * as ts from "typescript/unstable/ast";
import {
  isObjectType,
  isUnionType,
  SymbolFlags,
  type Symbol as TsSymbol,
  type Type,
  type TypeReference,
} from "typescript/unstable/sync";

import { jsdocOf } from "../jsdoc.ts";
import type { Project } from "../services/TypeScript.ts";
import { sectionsOf, tagValue } from "./sections.ts";

/** One property of an options or result type, as its declaration documents it. */
export type Member = {
  readonly name: string;
  /** The declared type, as written in source. */
  readonly type: string;
  readonly optional: boolean;
  /** The `@default` tag, if any. */
  readonly defaultValue: string | undefined;
  readonly description: string;
  /** The namespace the property is declared in (`Read`, `Write`), if any. */
  readonly namespace: string | undefined;
  readonly file: string;
};

/** The source text of a node, whitespace collapsed. */
export const textOf = (node: ts.Node): string => {
  const source = node.getSourceFile();
  return Str.trim(
    Str.replaceAll(/\s+/g, " ")(Str.slice(node.getStart(source), node.getEnd())(source.text)),
  );
};

/** The namespace (`declare namespace X`) a node is declared in, if any. */
const namespaceOf = (node: ts.Node): string | undefined => {
  for (
    let current: ts.Node | undefined = node.parent;
    current !== undefined;
    current = current.parent
  ) {
    if (ts.isModuleDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
    if (ts.isSourceFile(current)) return undefined;
  }
  return undefined;
};

/**
 * A property's type text with the type parameters of its enclosing alias replaced by their
 * constraints: `coin?: coin` in `Options<coin extends CoinType.Input | undefined>` reads
 * `CoinType.Input | undefined`.
 */
const declaredType = (
  declaration: ts.Node & { readonly type?: ts.TypeNode | undefined },
): string => {
  if (declaration.type === undefined) return "unknown";
  let text = textOf(declaration.type);
  for (
    let current: ts.Node | undefined = declaration.parent;
    current !== undefined;
    current = current.parent
  ) {
    if (!ts.isTypeAliasDeclaration(current) && !ts.isInterfaceDeclaration(current)) continue;
    for (const parameter of current.typeParameters ?? []) {
      const bound = parameter.constraint;
      if (bound === undefined) continue;
      text = Str.replaceAll(
        new RegExp(`(?<![\\w.])${parameter.name.text}(?![\\w])`, "g"),
        textOf(bound),
      )(text);
    }
    break;
  }
  return Str.replace(/^\|\s*/, "")(Str.replace(/\s*\|\s*undefined$/, "")(text));
};

/** The documented member behind one property symbol, or `undefined` for one without source. */
export const memberOf = (symbol: TsSymbol): Member | undefined => {
  const declaration = symbol.declarations[0]?.resolve();
  if (declaration === undefined || ts.isSourceFile(declaration)) return undefined;
  const source = declaration.getSourceFile();
  const doc = sectionsOf(jsdocOf(declaration, source) ?? "");
  const typed = declaration as ts.Node & { readonly type?: ts.TypeNode | undefined };

  return {
    name: symbol.name,
    type: declaredType(typed),
    optional: (symbol.flags & SymbolFlags.Optional) !== 0,
    defaultValue: tagValue(doc, "default"),
    description: Str.trim(Str.replaceAll(/\s*\n\s*/g, " ")(doc.summary)),
    namespace: namespaceOf(declaration),
    file: source.fileName,
  };
};

/** The members of a type, in declaration order; methods and private names are left out. */
export const membersOf = (project: Project, type: Type): readonly Member[] =>
  Arr.flatMap(project.checker.getPropertiesOfType(type), (symbol) => {
    if (Str.startsWith("#")(symbol.name) || Str.startsWith("__@")(symbol.name)) return [];
    const member = memberOf(symbol);
    return member === undefined ? [] : [member];
  });

/**
 * The members of an options type, split into variants when it is a union of object types with
 * different own members (`{ name } | { registry }`). Members a predicate marks as shared
 * (`Read.Options`) are dropped from the variants and returned once.
 */
export const optionsOf = (
  project: Project,
  type: Type,
  isShared: (member: Member) => boolean,
): { readonly variants: readonly (readonly Member[])[]; readonly shared: readonly Member[] } => {
  const constituents = isUnionType(type) ? (type.getTypes() ?? [type]) : [type];
  const all = Arr.map(constituents, (constituent) => membersOf(project, constituent));
  const shared = Arr.dedupeWith(
    Arr.filter(Arr.flatten(all), isShared),
    (a: Member, b: Member) => a.name === b.name,
  );
  // `name?: undefined` only marks the variants as exclusive.
  const own = Arr.map(all, (members) =>
    Arr.filter(
      members,
      (member) => !isShared(member) && member.type !== "undefined" && member.type !== "never",
    ),
  );
  const variants = Arr.dedupeWith(
    own,
    (a: readonly Member[], b: readonly Member[]) =>
      Arr.join(
        Arr.map(a, (member) => member.name),
        ",",
      ) ===
      Arr.join(
        Arr.map(b, (member) => member.name),
        ",",
      ),
  );
  return { variants, shared };
};

/**
 * The members a result type exposes one level down: the object itself, an array's element, or the
 * non-null part of `T | null`. Types declared outside the workspace (viem's `Address`) have none.
 */
export const resultMembersOf = (project: Project, type: Type): readonly Member[] => {
  const { checker } = project;
  const nonNull = checker.getNonNullableType(type) ?? type;
  const element = checker.isArrayType(nonNull)
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- array types are type references
      (checker.getTypeArguments(nonNull as TypeReference)[0] ?? nonNull)
    : nonNull;
  if (!isObjectType(element) && !isUnionType(element)) return [];
  const members = membersOf(project, element);
  return members.length > 0 && Arr.every(members, (member) => isWorkspaceFile(member.file))
    ? members
    : [];
};

/** Whether a declaration lives in a workspace package's source, not a dependency or the lib. */
export const isWorkspaceFile = (file: string): boolean =>
  Str.includes("/packages/")(file) && !Str.includes("/node_modules/")(file);
