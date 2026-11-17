import { join } from "node:path";

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
};

export type Domain = {
  readonly domain: string;
  readonly actions: readonly Action[];
};

export const isWrite = (action: Action): boolean =>
  writeMethods.every((method) => action.properties.includes(method));

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
    { name: string; folder: string; jsdoc: string; properties: string[]; types: string[] }
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
    const types = statement.body.statements
      .filter(ts.isTypeAliasDeclaration)
      .map((alias) => alias.name.text);
    actions.get(statement.name.text)?.types.push(...types);
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
    project
      .sourceFile(file)
      .statements.flatMap((statement) =>
        ts.isVariableStatement(statement) && isExported(statement)
          ? statement.declarationList.declarations.map((declaration) => declaration.name.getText())
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

  const domains = layout.map(({ domain, folders }) => {
    // Top-level client members that an action group's name would shadow.
    if (["chain", "account", "deployment", "publicClient", "config", "extend"].includes(domain))
      problems.push(`domain "${domain}" uses a reserved client name`);

    const actions = folders.flatMap(({ folder, files }) => {
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
