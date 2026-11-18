import { Array as Arr, Option, Predicate, String as Str } from "effect";

import * as ts from "typescript/unstable/ast";

import { isExported, jsdocOf } from "../jsdoc.ts";
import type { Member } from "./members.ts";
import { textOf } from "./members.ts";
import type { ErrorClassDoc, ErrorCodeDoc } from "./model.ts";
import { sectionsOf } from "./sections.ts";

/** What the error classes of a built package expose at runtime: their constructors by name. */
export type ErrorRuntime = {
  readonly classes: Readonly<Record<string, unknown>>;
  /** `Errors.describe` of the sdk, which has end-user copy for the sdk's codes only. */
  readonly describe: (error: unknown) => {
    title: string;
    message: string;
    action?: string | undefined;
  };
};

type Instance = {
  readonly shortMessage: string;
  readonly hint: string | undefined;
  readonly retryable: boolean;
};

const instanceOf = (constructor: unknown, code: string): Instance | undefined => {
  if (!Predicate.isFunction(constructor)) return undefined;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- error classes take `{ code }` and fill their defaults from it
    return new (constructor as new (options: { code: string }) => Instance)({ code });
  } catch {
    // A class whose defaults need more than the code documents only the code.
    return undefined;
  }
};

/**
 * The error classes declared in `files` (one class per file, its codes in
 * `declare namespace X { type Code = … }`), with the developer copy (`shortMessage`, `hint`,
 * `retryable`) their constructors build for each code, and the end-user copy of `describe`.
 */
export const errorClassDocs = (
  sources: readonly ts.SourceFile[],
  root: string,
  runtime: ErrorRuntime,
): readonly ErrorClassDoc[] =>
  Arr.flatMap(sources, (source): ErrorClassDoc[] => {
    const declaration = Arr.findFirst(
      source.statements,
      (statement): statement is ts.ClassDeclaration =>
        ts.isClassDeclaration(statement) && isExported(statement) && statement.name !== undefined,
    );
    if (Option.isNone(declaration)) return [];
    const name = declaration.value.name?.text ?? "";

    const codeAlias = Arr.findFirst(
      Arr.flatMap(source.statements, (statement) =>
        ts.isModuleDeclaration(statement) &&
        ts.isIdentifier(statement.name) &&
        statement.name.text === name &&
        statement.body !== undefined &&
        ts.isModuleBlock(statement.body)
          ? Arr.filter(statement.body.statements, ts.isTypeAliasDeclaration)
          : [],
      ),
      (alias) => alias.name.text === "Code",
    );
    const codes = Option.match(codeAlias, {
      onNone: () => [],
      onSome: (alias) =>
        Arr.map(
          [...Str.matchAll(/"([A-Z][A-Z0-9_]+)"/g)(textOf(alias.type))],
          ([, code]) => code ?? "",
        ),
    });

    const fields: Member[] = Arr.flatMap(declaration.value.members, (member): Member[] =>
      ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name) && member.type !== undefined
        ? [
            {
              name: member.name.text,
              type: Str.replace(/\s*\|\s*undefined$/, "")(textOf(member.type)),
              optional: false,
              defaultValue: undefined,
              description: Str.trim(
                Str.replaceAll(/\s*\n\s*/g, " ")(jsdocOf(member, source) ?? ""),
              ),
              namespace: undefined,
              file: source.fileName,
            },
          ]
        : [],
    );

    return [
      {
        name,
        root,
        summary: sectionsOf(jsdocOf(declaration.value, source) ?? "").summary,
        fields,
        codes: Arr.map(codes, (code): ErrorCodeDoc => {
          const instance = instanceOf(runtime.classes[name], code);
          let user: ErrorCodeDoc["user"];
          try {
            user = instance === undefined ? undefined : runtime.describe(instance);
          } catch {
            // `describe` has copy for the sdk's codes only.
            user = undefined;
          }
          return {
            code,
            errorClass: name,
            root,
            shortMessage: instance?.shortMessage ?? "",
            hint: instance?.hint,
            retryable: instance?.retryable ?? false,
            user,
          };
        }),
      },
    ];
  });
