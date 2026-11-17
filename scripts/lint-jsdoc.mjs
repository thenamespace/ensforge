// Checks ensforge's documentation format, in the style of Effect's `docgen --check`.
//
//   node ../../scripts/lint-jsdoc.mjs <entry.ts>...
//
// Run from a package folder with its source entries (e.g. src/index.ts src/effect.ts).
//
// 1. Every exported declaration reachable from the entries has a JSDoc block.
// 2. Every action (`src/actions/<domain>/<action>/index.ts`, an exported function with a sibling
//    `declare namespace` holding `ErrorType`) follows the Effect-style format:
//    - a description; only the sections **When to use** / **Details** / **Gotchas** /
//      **Example** (Title); **When to use** starts with "Use to|when|as|with";
//    - examples with unique titles, one ```ts fence each, covering the bound (`ens.<domain>.`),
//      standalone (`Actions.<domain>.<name>(`) and Effect (`@ensforge/sdk/effect`) forms;
//    - at least one `@throws` naming a real `Errors.<Class>`;
//    - `@since` (semver), `@stability` (stable|unstable|experimental) and `@category`;
//    - JSDoc on every namespace type and every member of `Options`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import ts from "typescript";

const entries = process.argv.slice(2);
const packageFolder = process.cwd();
const problems = [];
const sections = new Set(["**When to use**", "**Details**", "**Gotchas**"]);

const parse = (file) =>
  ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const isExported = (node) =>
  node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
const report = (file, message) => problems.push(`${relative(packageFolder, file)}: ${message}`);

const jsdocOf = (node, source) => {
  const ranges = ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? [];
  const last = ranges.at(-1);
  const raw = last === undefined ? "" : source.text.slice(last.pos, last.end);
  if (!raw.startsWith("/**")) return undefined;

  return raw
    .replace(/^\/\*\*\s?/, "")
    .replace(/\s*\*\/$/, "")
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, ""))
    .join("\n");
};

// The package's own error classes plus the sdk's, which extension packages also throw.
const errorClasses = (() => {
  const folders = [
    join(packageFolder, "src/errors/classes"),
    join(packageFolder, "../sdk/src/errors/classes"),
  ];
  return new Set(
    folders.flatMap((folder) =>
      existsSync(folder) ? readdirSync(folder).map((file) => file.replace(/\.ts$/, "")) : [],
    ),
  );
})();

// 1. Exported declarations reachable from the entries.
const visited = new Set();
const resolveModule = (from, specifier) => {
  if (!specifier.startsWith(".")) return undefined;
  const file = join(dirname(from), specifier.replace(/\.js$/, ".ts"));
  return existsSync(file) ? file : undefined;
};

const checkModule = (file) => {
  if (visited.has(file) || file.includes("/internal/")) return;
  visited.add(file);
  const source = parse(file);

  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) {
      const target = resolveModule(file, statement.moduleSpecifier.text);
      if (target !== undefined) checkModule(target);
      continue;
    }

    const named =
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement);
    if (named && isExported(statement) && jsdocOf(statement, source) === undefined) {
      report(file, `${statement.name?.text ?? "default"} has no JSDoc`);
    }
    if (
      ts.isVariableStatement(statement) &&
      isExported(statement) &&
      jsdocOf(statement, source) === undefined
    ) {
      const names = statement.declarationList.declarations.map((declaration) =>
        declaration.name.getText(source),
      );
      report(file, `${names.join(", ")} has no JSDoc`);
    }
  }
};

for (const entry of entries) checkModule(join(packageFolder, entry));

// 2. Action format.
const checkAction = (file, statement, namespace, source) => {
  const name = statement.name.text;
  const domain = relative(join(packageFolder, "src/actions"), file).split("/")[0];
  const fail = (message) => report(file, `${name}: ${message}`);
  const doc = jsdocOf(statement, source) ?? "";
  const tagStart = doc.search(/\n@/);
  const body = tagStart === -1 ? doc : doc.slice(0, tagStart);
  const tagText = tagStart === -1 ? "" : doc.slice(tagStart + 1);
  const lines = body.split("\n");

  if (!lines[0]?.trim()) fail("missing description on the first line");

  const examples = [];
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line.startsWith("**")) continue;

    const example = /^\*\*Example\*\* \((.+)\)$/.exec(line);
    if (example === null) {
      if (!sections.has(line)) fail(`unknown section heading ${line}`);
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
    const fences = block.filter((other) => other.trim().startsWith("```ts")).length;
    if (fences !== 1) fail(`example "${example[1]}" must contain exactly one \`\`\`ts fence`);
    examples.push({ title: example[1], code: block.join("\n") });
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
    value: value.trim(),
  }));
  const thrown = tags.filter((tag) => tag.tag === "throws");
  if (thrown.length === 0) fail("needs at least one @throws");
  for (const { value } of thrown) {
    const className = /^`Errors\.(\w+)`/.exec(value)?.[1];
    if (className === undefined || !errorClasses.has(className))
      fail(`@throws must name an Errors class: ${value}`);
  }
  const tagValue = (tag) => tags.find((entry) => entry.tag === tag)?.value;
  if (!/^\d+\.\d+\.\d+$/.test(tagValue("since") ?? "")) fail("@since must be semver");
  if (!["stable", "unstable", "experimental"].includes(tagValue("stability") ?? "")) {
    fail("@stability must be stable, unstable or experimental");
  }
  if (!tagValue("category")) fail("@category is required");

  const aliases = new Map(
    namespace.body.statements
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
      if (ts.getJSDocCommentsAndTags(member).length === 0)
        fail(`Options.${member.name.getText(source)} has no JSDoc`);
    }
  }
  if (!aliases.has("ErrorType")) fail("namespace needs ErrorType");
};

const actionsFolder = join(packageFolder, "src/actions");
const actionFiles = existsSync(actionsFolder)
  ? readdirSync(actionsFolder, { recursive: true })
      .filter((path) => path.split("/").length === 3 && path.endsWith("/index.ts"))
      .map((path) => join(actionsFolder, path))
  : [];

for (const file of actionFiles) {
  const source = parse(file);
  const namespaces = new Map(
    source.statements
      .filter(
        (statement) =>
          ts.isModuleDeclaration(statement) &&
          statement.body !== undefined &&
          ts.isModuleBlock(statement.body),
      )
      .map((statement) => [statement.name.text, statement]),
  );

  for (const statement of source.statements) {
    if (
      !ts.isFunctionDeclaration(statement) ||
      statement.name === undefined ||
      !isExported(statement)
    )
      continue;
    const namespace = namespaces.get(statement.name.text);
    if (namespace === undefined) {
      report(
        file,
        `${statement.name.text}: needs a \`declare namespace ${statement.name.text}\` with its types`,
      );
      continue;
    }
    checkAction(file, statement, namespace, source);
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`lint-jsdoc: ok (${visited.size} modules, ${actionFiles.length} action files)`);
