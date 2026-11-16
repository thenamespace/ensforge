import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

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
};

export type Domain = {
  readonly domain: string;
  readonly actions: readonly Action[];
};

export const isWrite = (action: Action): boolean =>
  writeMethods.every((method) => action.properties.includes(method));

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

const isExported = (node: ts.HasModifiers): boolean =>
  ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

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
const readActions = (file: string, folder: string): Action[] => {
  const source = parse(file);
  const actions = new Map<
    string,
    { name: string; folder: string; jsdoc: string; properties: string[] }
  >();

  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      isExported(statement)
    ) {
      const name = statement.name.text;
      actions.set(name, { name, folder, jsdoc: leadingJsDoc(statement, source), properties: [] });
    }
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
const readEffectExports = (file: string): Set<string> =>
  new Set(
    parse(file).statements.flatMap((statement) =>
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

  const domains = directories(actionsDir).map((domain) => {
    if (reserved.has(domain)) problems.push(`domain "${domain}" uses a reserved client name`);

    const actions = directories(join(actionsDir, domain)).flatMap((folder) => {
      const promiseFile = join(actionsDir, domain, folder, "index.ts");
      const effectFile = join(actionsDir, domain, folder, "effect.ts");
      if (!existsSync(promiseFile) || !existsSync(effectFile)) {
        problems.push(`${domain}/${folder}: needs index.ts and effect.ts`);
        return [];
      }

      const effectExports = readEffectExports(effectFile);
      const found = readActions(promiseFile, folder);
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
