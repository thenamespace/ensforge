import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import * as ts from "typescript/unstable/ast";

import { openProject, type Project } from "../../../../scripts/lib/typescript.mjs";

/** Names an action group may not use: they are top-level members of the client. */
const reserved = new Set(["chain", "account", "deployment", "publicClient", "config", "extend"]);

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

const isExported = (node: { readonly modifiers?: readonly ts.Node[] | undefined }): boolean =>
  node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

const leadingJsDoc = (node: ts.Node, source: ts.SourceFile): string => {
  const last = (ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? []).at(-1);
  const text = last === undefined ? "" : source.text.slice(last.pos, last.end);
  return text.startsWith("/**") ? text : "";
};

const directories = (folder: string): string[] =>
  readdirSync(folder)
    .filter((entry) => statSync(join(folder, entry)).isDirectory())
    .toSorted();

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
        jsdoc: leadingJsDoc(statement, source),
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
 * Reads every action under `actionsDir` and reports layout problems: missing files, Promise
 * actions without an Effect implementation (parity), and reserved domain names.
 */
export const discover = (actionsDir: string): { domains: Domain[]; problems: string[] } => {
  const problems: string[] = [];
  const files = directories(actionsDir).flatMap((domain) =>
    directories(join(actionsDir, domain)).flatMap((folder) =>
      ["index.ts", "effect.ts"]
        .map((name) => join(actionsDir, domain, folder, name))
        .filter((file) => existsSync(file)),
    ),
  );
  // The package folder: the project keeps its scratch config in its node_modules/.cache.
  const project = openProject(join(actionsDir, "../.."), files);

  const domains = directories(actionsDir).map((domain) => {
    if (reserved.has(domain)) problems.push(`domain "${domain}" uses a reserved client name`);

    const actions = directories(join(actionsDir, domain)).flatMap((folder) => {
      const promiseFile = join(actionsDir, domain, folder, "index.ts");
      const effectFile = join(actionsDir, domain, folder, "effect.ts");
      if (!existsSync(promiseFile) || !existsSync(effectFile)) {
        problems.push(`${domain}/${folder}: needs index.ts and effect.ts`);
        return [];
      }

      const effectExports = readEffectExports(project, effectFile);
      const found = readActions(project, promiseFile, folder);
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
  project.close();

  return { domains, problems };
};
