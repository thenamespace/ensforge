// oxlint-disable-next-line effecttsgo/node-builtin-import -- pure synchronous path arithmetic in AST helpers that run outside Effect programs
import { join } from "node:path";

import { Array as Arr, Option, String as Str } from "effect";

import * as ts from "typescript/unstable/ast";

import { discover, isWrite, sends, writeMethods, type Layout } from "../codegen/discover.ts";
import { jsdocOf, jsdocText } from "../jsdoc.ts";
import type { Project } from "../services/TypeScript.ts";
import { optionsOf, resultMembersOf, textOf, type Member } from "./members.ts";
import type { ActionDoc, Returns } from "./model.ts";
import { sectionsOf } from "./sections.ts";

/** Options declared in the SDK's shared `Read`/`Write` namespaces (`src/Types.ts`). */
const isShared = (member: Member): boolean =>
  /\/Types\.(d\.)?ts$/.test(member.file) &&
  (member.namespace === "Read" || member.namespace === "Write");

/** The alias `name` of `declare namespace <action>` in `source`. */
const aliasOf = (source: ts.SourceFile, action: string, name: string) =>
  Option.getOrUndefined(
    Arr.findFirst(
      Arr.flatMap(source.statements, (statement) =>
        ts.isModuleDeclaration(statement) &&
        ts.isIdentifier(statement.name) &&
        statement.name.text === action &&
        statement.body !== undefined &&
        ts.isModuleBlock(statement.body)
          ? Arr.filter(statement.body.statements, ts.isTypeAliasDeclaration)
          : [],
      ),
      (alias) => alias.name.text === name,
    ),
  );

const returnsOf = (project: Project, source: ts.SourceFile, action: string): Returns => {
  const alias = aliasOf(source, action, "ReturnType");
  if (alias === undefined) return { type: "void", description: "", members: [] };
  const symbol = project.checker.getSymbolAtLocation(alias.name);
  return {
    // Conditional and long types read better by name; the description says what they hold.
    type:
      /\bextends\b/.test(textOf(alias.type)) || textOf(alias.type).length > 80
        ? `${action}.ReturnType`
        : textOf(alias.type),
    description: Str.trim(Str.replaceAll(/\s*\n\s*/g, " ")(jsdocOf(alias, source) ?? "")),
    members:
      symbol === undefined
        ? []
        : resultMembersOf(project, project.checker.getDeclaredTypeOfSymbol(symbol)),
  };
};

/** The one-line docs of `action.<property> = …` assignments (`prepare`, `request`). */
const propertyDocs = (source: ts.SourceFile, action: string): Map<string, string> => {
  const docs = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression))
      continue;
    const { left } = statement.expression;
    if (
      ts.isPropertyAccessExpression(left) &&
      ts.isIdentifier(left.expression) &&
      left.expression.text === action
    )
      docs.set(left.name.text, Str.trim(jsdocOf(statement, source) ?? ""));
  }
  return docs;
};

/**
 * Reads every action folder of a package into the model its pages render from: one page per
 * folder, its `…Sync` form folded in.
 */
export const actionDocs = (
  project: Project,
  root: string,
  actionsDir: string,
  layout: Layout,
): {
  readonly domains: readonly { readonly domain: string; readonly actions: readonly ActionDoc[] }[];
  readonly problems: readonly string[];
} => {
  const { domains, problems } = discover(project, actionsDir, layout);

  return {
    problems,
    domains: Arr.map(domains, ({ domain, actions }) => ({
      domain,
      actions: Arr.flatMap([...new Set(Arr.map(actions, (action) => action.folder))], (folder) => {
        const inFolder = Arr.filter(actions, (action) => action.folder === folder);
        const base = Arr.findFirst(inFolder, (action) => action.name === folder).pipe(
          Option.orElse(() =>
            Arr.findFirst(inFolder, (action) => !Str.endsWith("Sync")(action.name)),
          ),
        );
        if (Option.isNone(base)) return [];
        const action = base.value;
        const source = project.sourceFile(join(actionsDir, domain, folder, "index.ts"));
        const sync = Arr.findFirst(inFolder, (other) => other.name === `${action.name}Sync`);
        const options = aliasOf(source, action.name, "Options");
        const optionsSymbol =
          options === undefined ? undefined : project.checker.getSymbolAtLocation(options.name);
        const resolved =
          optionsSymbol === undefined
            ? { variants: [], shared: [] }
            : optionsOf(project, project.checker.getDeclaredTypeOfSymbol(optionsSymbol), isShared);
        const write = isWrite(action);
        const docs = propertyDocs(source, action.name);

        // Writes take `Write.Options` beside their own options, in the function's signature.
        const shared = [
          ...new Set([
            ...Arr.flatMap(resolved.shared, (member) =>
              member.namespace === undefined ? [] : [member.namespace],
            ),
            ...(write ? ["Write"] : []),
          ]),
        ];

        const doc: ActionDoc = {
          root,
          domain,
          folder,
          name: action.name,
          doc: sectionsOf(jsdocText(action.jsdoc)),
          kind: write ? "write" : sends(action, actions) ? "send" : "read",
          batchable: action.properties.includes("request"),
          options: { variants: resolved.variants, shared },
          returns: returnsOf(project, source, action.name),
          planMethods: Arr.filter(
            Arr.map(writeMethods, (method) => ({
              name: method,
              description: docs.get(method) ?? "",
            })),
            (method) => action.properties.includes(method.name),
          ),
          sync: Option.getOrUndefined(
            Option.map(sync, (form) => ({
              name: form.name,
              doc: sectionsOf(jsdocText(form.jsdoc)),
              returns: returnsOf(project, source, form.name),
            })),
          ),
        };
        return [doc];
      }),
    })),
  };
};
