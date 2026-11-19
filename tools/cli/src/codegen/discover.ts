// oxlint-disable-next-line effecttsgo/node-builtin-import -- pure synchronous path arithmetic in AST helpers that run outside Effect programs
import { join } from "node:path";

import { Array as Arr, Option, String as Str } from "effect";

import * as ts from "typescript/unstable/ast";

import { isExported, jsdocBlockOf } from "../jsdoc.ts";
import type { Project } from "../services/TypeScript.ts";

/** Properties that make an action a write (built by `Action.write`). */
export const writeMethods = ["prepare", "simulate", "estimateGas"] as const;

/** One exported action function of `actions/<domain>/<folder>/index.ts`. */
export type Action = {
  readonly name: string;
  readonly folder: string;
  /** Its JSDoc block, verbatim. */
  readonly jsdoc: string;
  /** Properties assigned after the declaration (`request`, `prepare`, …). */
  readonly properties: readonly string[];
  /** Types declared in the action's namespace (`Options`, `ReturnType`, `Bound`, …). */
  readonly types: readonly string[];
  /** Source range of the `ErrorType` alias's type in the action's namespace, which codegen writes. */
  readonly errorType: { readonly start: number; readonly end: number } | undefined;
};

export type Domain = {
  readonly domain: string;
  readonly actions: readonly Action[];
};

export const isWrite = (action: Action): boolean =>
  Arr.every(writeMethods, (method) => action.properties.includes(method));

/**
 * Whether `action` signs and sends: a write, the `…Sync` form of one in the same folder
 * (`record.setSync`), or another action documented as writing (`plan.resume`).
 */
export const sends = (action: Action, actions: readonly Action[]): boolean =>
  isWrite(action) ||
  /^\s*\* @category writing$/m.test(action.jsdoc) ||
  (Str.endsWith("Sync")(action.name) &&
    Arr.some(
      actions,
      (other) =>
        other.folder === action.folder && `${other.name}Sync` === action.name && isWrite(other),
    ));

/**
 * Error classes an action's `@throws` tags name, in order: `Errors.UnauthorizedError` →
 * `UnauthorizedError`. A tag may name several, or `Errors.AnyError` for an action that runs
 * arbitrary steps (`plan.send`).
 */
export const documentedErrors = (action: Action): readonly string[] => [
  ...new Set(
    Arr.flatMap(
      Arr.filter(Str.split(action.jsdoc, "\n"), (line) => Str.includes("@throws")(line)),
      (line: string) =>
        Arr.map([...Str.matchAll(/`Errors\.(\w+)`/g)(line)], ([, name]) => name ?? ""),
    ),
  ),
];

/** The action folders of each domain under `src/actions`, sorted, with the files they have. */
export type Layout = readonly {
  readonly domain: string;
  readonly folders: readonly { readonly folder: string; readonly files: readonly string[] }[];
}[];

/** Exported functions of an action's index.ts, with the properties assigned to them. */
const readActions = (project: Project, file: string, folder: string): Action[] => {
  const source = project.sourceFile(file);
  const actions = new Map<
    string,
    {
      name: string;
      folder: string;
      jsdoc: string;
      properties: string[];
      types: string[];
      errorType: { start: number; end: number } | undefined;
    }
  >();

  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      isExported(statement)
    ) {
      const name = statement.name.text;
      actions.set(name, {
        name,
        folder,
        jsdoc: jsdocBlockOf(statement, source) ?? "",
        properties: [],
        types: [],
        errorType: undefined,
      });
    }
  }
  for (const statement of source.statements) {
    if (
      !ts.isModuleDeclaration(statement) ||
      statement.body === undefined ||
      !ts.isModuleBlock(statement.body)
    )
      continue;
    const aliases = Arr.filter(statement.body.statements, ts.isTypeAliasDeclaration);
    const action = actions.get(statement.name.text);
    if (action === undefined) continue;
    action.types.push(...Arr.map(aliases, (alias) => alias.name.text));
    const errorType = Option.getOrUndefined(
      Option.map(
        Arr.findFirst(aliases, (alias) => alias.name.text === "ErrorType"),
        (alias) => alias.type,
      ),
    );
    if (errorType !== undefined)
      action.errorType = { start: errorType.getStart(source), end: errorType.getEnd() };
  }
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression))
      continue;
    const { left } = statement.expression;
    if (ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression)) {
      actions.get(left.expression.text)?.properties.push(left.name.text);
    }
  }

  return [...actions.values()];
};

/** Exported value names of an action's effect.ts. */
const readEffectExports = (project: Project, file: string): Set<string> =>
  new Set(
    Arr.flatMap(project.sourceFile(file).statements, (statement) =>
      ts.isVariableStatement(statement) && isExported(statement)
        ? Arr.map(statement.declarationList.declarations, (declaration) =>
            declaration.name.getText(),
          )
        : [],
    ),
  );

/**
 * Reads every action of `layout` and reports layout problems: missing files, Promise actions
 * without an Effect implementation (parity), and reserved domain names.
 */
export const discover = (
  project: Project,
  actionsDir: string,
  layout: Layout,
): { domains: Domain[]; problems: string[] } => {
  const problems: string[] = [];

  const domains = Arr.map(layout, ({ domain, folders }) => {
    // Top-level client members that an action group's name would shadow.
    if (["chain", "account", "deployment", "client", "config", "extend"].includes(domain))
      problems.push(`domain "${domain}" uses a reserved client name`);

    const actions = Arr.flatMap(folders, ({ folder, files }) => {
      if (!files.includes("index.ts") || !files.includes("effect.ts")) {
        problems.push(`${domain}/${folder}: needs index.ts and effect.ts`);
        return [];
      }

      const effectExports = readEffectExports(
        project,
        join(actionsDir, domain, folder, "effect.ts"),
      );
      const found = readActions(project, join(actionsDir, domain, folder, "index.ts"), folder);
      for (const action of found) {
        if (!effectExports.has(action.name))
          problems.push(`${domain}/${folder}: effect.ts does not export ${action.name}`);
        if (isWrite(action) && !effectExports.has(`${action.name}Methods`)) {
          problems.push(`${domain}/${folder}: effect.ts does not export ${action.name}Methods`);
        }
      }
      return found;
    });

    return { domain, actions };
  });

  return { domains, problems };
};
