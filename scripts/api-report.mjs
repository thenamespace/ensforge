// Writes or checks a report of a package's public API: every export of each entry, walking into
// namespaces (`export * as Errors`), with its signature. Reviewing the diff of `etc/*.api.md` shows
// every public API change. API Extractor was not used because it does not report the members of
// namespace re-exports, which is most of the ensforge API.
//
//   node ../../scripts/api-report.mjs <entry>...          update etc/*.api.md
//   node ../../scripts/api-report.mjs --check <entry>...  fail when a report is out of date
//
// Entries are dist/<entry>.d.ts files; run after `pnpm build`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const args = process.argv.slice(2);
const check = args.includes("--check");
const entries = args.filter((arg) => arg !== "--check");
const packageFolder = process.cwd();
const packageName = JSON.parse(readFileSync(join(packageFolder, "package.json"), "utf8")).name;

const flags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.InTypeAlias |
  ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType |
  ts.TypeFormatFlags.WriteArrowStyleSignature;

const isAbi = (value) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === "object" && item !== null && typeof item.type === "string");

const parameterType = (parameter) =>
  parameter.type.startsWith("tuple")
    ? `(${parameter.components.map(parameterType).join(",")})${parameter.type.slice("tuple".length)}`
    : parameter.type;

/** One ABI item as `kind name(inputs) mutability returns (outputs)`. */
const formatItem = (item) => {
  const inputs = (item.inputs ?? []).map(parameterType).join(",");
  const mutability =
    item.stateMutability === undefined || item.stateMutability === "nonpayable"
      ? ""
      : ` ${item.stateMutability}`;
  const outputs =
    item.outputs === undefined || item.outputs.length === 0
      ? ""
      : ` returns (${item.outputs.map(parameterType).join(",")})`;
  return `${item.type}${item.name === undefined ? "" : ` ${item.name}`}(${inputs})${mutability}${outputs}`;
};

const isNamespace = (symbol) =>
  (symbol.flags & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0 &&
  !(symbol.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Class | ts.SymbolFlags.Variable));

const valueAt = (module, path) => path.split(".").reduce((value, key) => value?.[key], module);

const reportOf = async (entry) => {
  // An entry is `dist/<entry>.d.ts` or, for a folder entry, `dist/<entry>/index.d.ts`.
  const flat = join(packageFolder, "dist", `${entry}.d.ts`);
  const file = existsSync(flat) ? flat : join(packageFolder, "dist", entry, "index.d.ts");
  // ABIs print as one signature per line instead of their (huge) literal type.
  const runtime = await import(pathToFileURL(file.replace(/\.d\.ts$/, ".js")).href);
  const program = ts.createProgram([file], {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const lines = [];
  const seen = new Set();

  const resolve = (symbol) =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const location = (symbol) => symbol.declarations?.[0] ?? program.getSourceFile(file);

  const describeType = (path, symbol) => {
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    if (symbol.flags & ts.SymbolFlags.Interface) {
      const members = checker
        .getPropertiesOfType(type)
        .map(
          (member) =>
            `  ${member.name}${member.flags & ts.SymbolFlags.Optional ? "?" : ""}: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(member, location(symbol)), undefined, flags)}`,
        );
      lines.push(`interface ${path} {`, ...members, "}");
      return;
    }
    lines.push(`type ${path} = ${checker.typeToString(type, undefined, flags)}`);
  };

  const describeValue = (path, symbol) => {
    const type = checker.getTypeOfSymbolAtLocation(symbol, location(symbol));
    if (symbol.flags & ts.SymbolFlags.Class) {
      const instance = checker.getDeclaredTypeOfSymbol(symbol);
      const members = checker
        .getPropertiesOfType(instance)
        .filter((member) => !member.name.startsWith("#"))
        .map(
          (member) =>
            `  ${member.name}: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(member, location(symbol)), undefined, flags)}`,
        );
      const constructors = type
        .getConstructSignatures()
        .map(
          (signature) => `  constructor${checker.signatureToString(signature, undefined, flags)}`,
        );
      lines.push(`class ${path} {`, ...constructors, ...members, "}");
      return;
    }

    const value = valueAt(runtime, path);
    if (isAbi(value)) {
      lines.push(`const ${path}: Abi`, ...value.map((item) => `  ${formatItem(item)}`));
      return;
    }

    const signatures = type.getCallSignatures();
    if (signatures.length === 0) {
      lines.push(`const ${path}: ${checker.typeToString(type, undefined, flags)}`);
      return;
    }
    for (const signature of signatures)
      lines.push(`function ${path}${checker.signatureToString(signature, undefined, flags)}`);
    // Function properties such as `set.prepare`; expando assignments are walked as exports instead.
    for (const property of checker.getPropertiesOfType(type)) {
      if (symbol.exports?.has(property.escapedName)) continue;
      lines.push(
        `const ${path}.${property.name}: ${checker.typeToString(checker.getTypeOfSymbolAtLocation(property, location(symbol)), undefined, flags)}`,
      );
    }
  };

  const walk = (prefix, symbols) => {
    for (const exported of [...symbols].toSorted((a, b) => a.name.localeCompare(b.name))) {
      const symbol = resolve(exported);
      const path = prefix === "" ? exported.name : `${prefix}.${exported.name}`;

      if (isNamespace(symbol)) {
        if (seen.has(symbol)) {
          lines.push(`namespace ${path} = (see above)`);
          continue;
        }
        seen.add(symbol);
        walk(path, checker.getExportsOfModule(symbol));
        continue;
      }

      if (symbol.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Class | ts.SymbolFlags.Variable))
        describeValue(path, symbol);
      if (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))
        describeType(path, symbol);
      // Type-only namespaces merged with values (e.g. `getText.Options`).
      if (symbol.flags & ts.SymbolFlags.NamespaceModule && symbol.exports !== undefined)
        walk(path, symbol.exports.values());
    }
  };

  const source = program.getSourceFile(file);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (source === undefined || diagnostics.length > 0) {
    throw new Error(`${entry}: ${ts.formatDiagnostics(diagnostics, ts.createCompilerHost({}))}`);
  }
  walk("", checker.getExportsOfModule(checker.getSymbolAtLocation(source)));

  // Types outside the entry's scope print as `import("/abs/path").Name`; keep only the name.
  // Unique-symbol keys print with a compiler-internal id (`__@name@123`) that changes between runs.
  const text = lines
    .join("\n")
    .replaceAll(/import\("[^"]+"\)\./g, "")
    .replaceAll(/__@(\w+)@\d+/g, "[$1]");

  return `# API report: ${packageName}${entry === "index" ? "" : `/${entry}`}\n\n<!-- Generated by scripts/api-report.mjs. Review changes; do not edit. -->\n\n\`\`\`ts\n${text}\n\`\`\`\n`;
};

if (entries.length === 0) {
  console.error("usage: api-report.mjs [--check] <entry>...");
  process.exit(1);
}

mkdirSync(join(packageFolder, "etc"), { recursive: true });
const unscoped = packageName.split("/").at(-1);
const stale = [];

const reports = await Promise.all(
  entries.map(async (entry) => ({ entry, report: await reportOf(entry) })),
);

for (const { entry, report } of reports) {
  const name = entry === "index" ? unscoped : `${unscoped}.${entry.replaceAll("/", "-")}`;
  const target = join(packageFolder, "etc", `${name}.api.md`);

  if (check) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== report) stale.push(target);
  } else {
    writeFileSync(target, report);
  }
}

if (stale.length > 0) {
  console.error(
    `API report out of date; run \`pnpm api:report\` and review the diff:\n${stale.join("\n")}`,
  );
  process.exit(1);
}
console.log(`api-report: ${check ? "ok" : "written"} (${entries.join(", ")})`);
