// oxlint-disable-next-line effecttsgo/node-builtin-import -- pure synchronous path arithmetic in AST helpers that run outside Effect programs
import { dirname, join } from "node:path";

import { String as Str, Array as Arr } from "effect";

import * as ts from "typescript/unstable/ast";

import { isExported, jsdocOf } from "../jsdoc.ts";
import type { Project } from "../services/TypeScript.ts";

/**
 * Exported declarations without a JSDoc block, in every module reachable from the entries
 * through relative re-exports. `internal/` modules are not public and are skipped.
 */
export const undocumentedExports = (
  project: Project,
  entries: readonly string[],
  exists: (file: string) => boolean,
): { readonly problems: readonly [file: string, message: string][]; readonly modules: number } => {
  const problems: [string, string][] = [];
  const visited = new Set<string>();

  const resolveModule = (from: string, specifier: string): string | undefined => {
    if (!Str.startsWith(".")(specifier)) return undefined;
    const file = join(dirname(from), Str.replace(/\.js$/, ".ts")(specifier));
    return exists(file) ? file : undefined;
  };

  const check = (file: string) => {
    if (visited.has(file) || Str.includes("/internal/")(file)) return;
    visited.add(file);
    const source = project.sourceFile(file);

    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) {
        const specifier = statement.moduleSpecifier;
        const target = ts.isStringLiteral(specifier)
          ? resolveModule(file, specifier.text)
          : undefined;
        if (target !== undefined) check(target);
        continue;
      }

      const named =
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement);
      if (named && isExported(statement) && jsdocOf(statement, source) === undefined) {
        problems.push([file, `${statement.name?.text ?? "default"} has no JSDoc`]);
      }
      if (
        ts.isVariableStatement(statement) &&
        isExported(statement) &&
        jsdocOf(statement, source) === undefined
      ) {
        const names = Arr.map(statement.declarationList.declarations, (declaration) =>
          declaration.name.getText(source),
        );
        problems.push([file, `${Arr.join(names, ", ")} has no JSDoc`]);
      }
    }
  };

  for (const entry of entries) check(entry);
  return { problems, modules: visited.size };
};
