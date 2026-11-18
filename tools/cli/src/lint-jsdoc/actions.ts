// oxlint-disable-next-line effecttsgo/node-builtin-import -- pure synchronous path arithmetic in AST helpers that run outside Effect programs
import { relative, join } from "node:path";

import { Array as Arr, Option, Record as Rec, String as Str } from "effect";

import * as ts from "typescript/unstable/ast";

import { isExported, jsdocOf } from "../jsdoc.ts";

/** Whether a type literal member has a name (`TypeElementBase` does not declare one). */
const hasName = (member: ts.TypeElement): member is ts.TypeElement & { readonly name: ts.Node } =>
  "name" in member;

/**
 * Problems in one action file (`src/actions/<domain>/<action>/index.ts`): the Effect-style doc
 * format, the three example forms (bound, standalone, Effect), `@throws` naming real error
 * classes, `@since`/`@stability`/`@category`, and docs on the namespace types and `Options`.
 */
export const checkActionFile = (
  file: string,
  source: ts.SourceFile,
  actionsFolder: string,
  errorClasses: ReadonlySet<string>,
): string[] => {
  const problems: string[] = [];
  const domain = Str.split(relative(actionsFolder, file), "/")[0] ?? "";
  const namespaces = new Map(
    Arr.map(
      Arr.filter(
        source.statements,
        (
          statement,
        ): statement is ts.ModuleDeclaration & {
          readonly name: ts.Identifier;
          readonly body: ts.ModuleBlock;
        } =>
          ts.isModuleDeclaration(statement) &&
          ts.isIdentifier(statement.name) &&
          statement.body !== undefined &&
          ts.isModuleBlock(statement.body),
      ),
      (statement) => [statement.name.text, statement],
    ),
  );

  for (const statement of source.statements) {
    if (
      !ts.isFunctionDeclaration(statement) ||
      statement.name === undefined ||
      !isExported(statement)
    )
      continue;
    const name = statement.name.text;
    const fail = (message: string) => problems.push(`${name}: ${message}`);
    const namespace = namespaces.get(name);
    if (namespace === undefined) {
      fail(`needs a \`declare namespace ${name}\` with its types`);
      continue;
    }

    const doc = jsdocOf(statement, source) ?? "";
    const tagStart = Str.search(/\n@/)(doc);
    const body = Option.match(tagStart, {
      onNone: () => doc,
      onSome: (at) => Str.slice(0, at)(doc),
    });
    const tagText = Option.match(tagStart, {
      onNone: () => "",
      onSome: (at) => Str.slice(at + 1)(doc),
    });
    const lines = Str.split(body, "\n");
    if (Str.isEmpty(Str.trim(lines[0]))) fail("missing description on the first line");

    const examples: { readonly title: string; readonly code: string }[] = [];
    for (const [index, raw] of lines.entries()) {
      const line = Str.trim(raw);
      if (!Str.startsWith("**")(line)) continue;

      const example = /^\*\*Example\*\* \((.+)\)$/.exec(line);
      if (example === null) {
        if (!["**When to use**", "**Details**", "**Gotchas**"].includes(line))
          fail(`unknown section heading ${line}`);
        if (line === "**When to use**") {
          const first = Arr.findFirst(lines.slice(index + 1), (next) => Str.trim(next) !== "");
          if (
            !/^Use (to|when|as|with)\b/.test(
              Option.getOrElse(Option.map(first, Str.trim), () => ""),
            )
          )
            fail("**When to use** must start with Use to/when/as/with");
        }
        continue;
      }

      const next = Arr.findFirstIndex(
        lines,
        (other, position) => position > index && Str.startsWith("**")(Str.trim(other)),
      );
      const block = lines.slice(index + 1, Option.getOrUndefined(next));
      if (Arr.filter(block, (other) => Str.startsWith("```ts")(Str.trim(other))).length !== 1)
        fail(`example "${example[1]}" must contain exactly one \`\`\`ts fence`);
      examples.push({ title: example[1] ?? "", code: Arr.join(block, "\n") });
    }

    const titles = Arr.map(examples, (example) => example.title);
    if (new Set(titles).size !== titles.length) fail("duplicate example titles");
    const forms = {
      bound: Arr.some(examples, (example) =>
        new RegExp(`\\bens\\.${domain}\\.${name}\\b`).test(example.code),
      ),
      standalone: Arr.some(
        examples,
        (example) =>
          new RegExp(`Actions\\.${domain}\\.${name}\\(`).test(example.code) &&
          !Str.includes("/effect")(example.code),
      ),
      effect: Arr.some(examples, (example) => /"@ensforge\/[a-z-]+\/effect"/.test(example.code)),
    };
    for (const [form, present] of Rec.toEntries(forms))
      if (!present) fail(`missing ${form} example`);

    const tags = Arr.map([...Str.matchAll(/^@(\w+)\s*(.*)$/gm)(tagText)], ([, tag, value]) => ({
      tag,
      value: Str.trim(value ?? ""),
    }));
    const thrown = Arr.filter(tags, (tag) => tag.tag === "throws");
    if (thrown.length === 0) fail("needs at least one @throws");
    // Codegen builds `ErrorType` from every class a `@throws` names; `AnyError` is the whole set.
    for (const { value } of thrown) {
      const named = Arr.map(
        [...Str.matchAll(/`Errors\.(\w+)`/g)(value)],
        ([, error]) => error ?? "",
      );
      if (
        !Str.startsWith("`Errors.")(value) ||
        Arr.some(named, (error) => error !== "AnyError" && !errorClasses.has(error))
      )
        fail(`@throws must name an Errors class: ${value}`);
    }
    const tagValue = (tag: string) =>
      Option.getOrUndefined(
        Option.map(
          Arr.findFirst(tags, (entry) => entry.tag === tag),
          (entry) => entry.value,
        ),
      );
    if (!/^\d+\.\d+\.\d+$/.test(tagValue("since") ?? "")) fail("@since must be semver");
    if (!["stable", "unstable", "experimental"].includes(tagValue("stability") ?? ""))
      fail("@stability must be stable, unstable or experimental");
    if (Str.isEmpty(tagValue("category") ?? "")) fail("@category is required");

    const aliases = new Map(
      Arr.map(Arr.filter(namespace.body.statements, ts.isTypeAliasDeclaration), (alias) => [
        alias.name.text,
        alias,
      ]),
    );
    for (const [aliasName, alias] of aliases)
      if (jsdocOf(alias, source) === undefined) fail(`${aliasName} has no JSDoc`);

    const options = aliases.get("Options");
    const literals =
      options === undefined
        ? []
        : [options.type, ...(ts.isIntersectionTypeNode(options.type) ? options.type.types : [])];
    for (const literal of Arr.filter(literals, ts.isTypeLiteralNode)) {
      for (const member of literal.members) {
        if ((member.jsDoc ?? []).length > 0) continue;
        const memberName = hasName(member) ? member.name.getText(source) : "?";
        fail(`Options.${memberName} has no JSDoc`);
      }
    }
    if (!aliases.has("ErrorType")) fail("namespace needs ErrorType");
  }
  return problems;
};

/** The action index files under `src/actions`: `<domain>/<action>/index.ts`. */
export const actionFilesOf = (actionsFolder: string, paths: readonly string[]): string[] =>
  Arr.map(
    Arr.filter(
      paths,
      (path) => Str.split(path, "/").length === 3 && Str.endsWith("/index.ts")(path),
    ),
    (path) => join(actionsFolder, path),
  );
