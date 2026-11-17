import { relative, join } from "node:path";

import * as ts from "typescript/unstable/ast";

import { isExported, jsdocOf } from "../jsdoc.ts";

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
  const domain = relative(actionsFolder, file).split("/")[0] ?? "";
  const namespaces = new Map(
    source.statements
      .filter(
        (statement): statement is ts.ModuleDeclaration =>
          ts.isModuleDeclaration(statement) &&
          statement.body !== undefined &&
          ts.isModuleBlock(statement.body),
      )
      .map((statement) => [(statement.name as ts.Identifier).text, statement]),
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
    const tagStart = doc.search(/\n@/);
    const body = tagStart === -1 ? doc : doc.slice(0, tagStart);
    const tagText = tagStart === -1 ? "" : doc.slice(tagStart + 1);
    const lines = body.split("\n");
    if (!lines[0]?.trim()) fail("missing description on the first line");

    const examples: { readonly title: string; readonly code: string }[] = [];
    for (const [index, raw] of lines.entries()) {
      const line = raw.trim();
      if (!line.startsWith("**")) continue;

      const example = /^\*\*Example\*\* \((.+)\)$/.exec(line);
      if (example === null) {
        if (!["**When to use**", "**Details**", "**Gotchas**"].includes(line))
          fail(`unknown section heading ${line}`);
        if (line === "**When to use**") {
          const first = lines.slice(index + 1).find((next) => next.trim() !== "");
          if (!/^Use (to|when|as|with)\b/.test(first?.trim() ?? ""))
            fail("**When to use** must start with Use to/when/as/with");
        }
        continue;
      }

      const next = lines.findIndex(
        (other, position) => position > index && other.trim().startsWith("**"),
      );
      const block = lines.slice(index + 1, next === -1 ? undefined : next);
      if (block.filter((other) => other.trim().startsWith("```ts")).length !== 1)
        fail(`example "${example[1]}" must contain exactly one \`\`\`ts fence`);
      examples.push({ title: example[1] ?? "", code: block.join("\n") });
    }

    const titles = examples.map((example) => example.title);
    if (new Set(titles).size !== titles.length) fail("duplicate example titles");
    const forms = {
      bound: examples.some((example) =>
        new RegExp(`\\bens\\.${domain}\\.${name}\\b`).test(example.code),
      ),
      standalone: examples.some(
        (example) =>
          new RegExp(`Actions\\.${domain}\\.${name}\\(`).test(example.code) &&
          !example.code.includes("/effect"),
      ),
      effect: examples.some((example) => /"@ensforge\/[a-z-]+\/effect"/.test(example.code)),
    };
    for (const [form, present] of Object.entries(forms))
      if (!present) fail(`missing ${form} example`);

    const tags = [...tagText.matchAll(/^@(\w+)\s*(.*)$/gm)].map(([, tag, value]) => ({
      tag,
      value: (value ?? "").trim(),
    }));
    const thrown = tags.filter((tag) => tag.tag === "throws");
    if (thrown.length === 0) fail("needs at least one @throws");
    for (const { value } of thrown) {
      const className = /^`Errors\.(\w+)`/.exec(value)?.[1];
      if (className === undefined || !errorClasses.has(className))
        fail(`@throws must name an Errors class: ${value}`);
    }
    const tagValue = (tag: string) => tags.find((entry) => entry.tag === tag)?.value;
    if (!/^\d+\.\d+\.\d+$/.test(tagValue("since") ?? "")) fail("@since must be semver");
    if (!["stable", "unstable", "experimental"].includes(tagValue("stability") ?? ""))
      fail("@stability must be stable, unstable or experimental");
    if (!tagValue("category")) fail("@category is required");

    const aliases = new Map(
      (namespace.body as ts.ModuleBlock).statements
        .filter(ts.isTypeAliasDeclaration)
        .map((alias) => [alias.name.text, alias]),
    );
    for (const [aliasName, alias] of aliases)
      if (jsdocOf(alias, source) === undefined) fail(`${aliasName} has no JSDoc`);

    const options = aliases.get("Options");
    const literals =
      options === undefined
        ? []
        : [options.type, ...(ts.isIntersectionTypeNode(options.type) ? options.type.types : [])];
    for (const literal of literals.filter(ts.isTypeLiteralNode)) {
      for (const member of literal.members) {
        if ((member.jsDoc ?? []).length === 0)
          fail(
            `Options.${(member as { readonly name?: ts.Node }).name?.getText(source) ?? "?"} has no JSDoc`,
          );
      }
    }
    if (!aliases.has("ErrorType")) fail("namespace needs ErrorType");
  }
  return problems;
};

/** The action index files under `src/actions`: `<domain>/<action>/index.ts`. */
export const actionFilesOf = (actionsFolder: string, paths: readonly string[]): string[] =>
  paths
    .filter((path) => path.split("/").length === 3 && path.endsWith("/index.ts"))
    .map((path) => join(actionsFolder, path));
