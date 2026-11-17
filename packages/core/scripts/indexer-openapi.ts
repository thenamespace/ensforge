// Pins the OpenAPI contracts of the built-in indexers and checks ensforge's wire Schemas against them.
//
//   node scripts/indexer-openapi.ts refresh  fetch both specs into openapi/ (review the diff)
//   node scripts/indexer-openapi.ts check    offline: every decoded field exists in the snapshots
//   node scripts/indexer-openapi.ts drift    online: the live specs still have every decoded field
//
// `check` and `drift` read the built Schemas (dist/), so run them after `pnpm build`.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Spec = {
  readonly info?: { readonly version?: string; readonly "x-build-sha"?: string };
  readonly components: {
    readonly schemas: Readonly<Record<string, { readonly properties?: Record<string, unknown> }>>;
  };
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const folder = join(root, "openapi");
const indexers = {
  bigname: ["https://api.bigname.sh/openapi.json", "https://sepolia.api.bigname.sh/openapi.json"],
  goldsky: ["https://ens-api.goldsky.com/openapi.json"],
} as const;
type Id = keyof typeof indexers;

// Goldsky names some components differently, composes RegistryLabel (allOf) and has no
// `/resolvers` route. Fields it leaves out decode as missing, so they are only reported.
const goldskyAliases: Readonly<Record<string, string>> = {
  EnsV1: "EnsV1Facts",
  Namespace: "NamespaceData",
  PermissionRow: "Permission",
};
const goldskySkipped = new Set(["RegistryLabel", "RoleHolderResolver"]);

const fetchSpec = async (url: string): Promise<{ text: string; spec: Spec }> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const text = await response.text();
  return { text, spec: JSON.parse(text) as Spec };
};

const snapshot = (id: Id): Spec =>
  JSON.parse(readFileSync(join(folder, `${id}.json`), "utf8")) as Spec;

/** Field names each wire Schema decodes, by OpenAPI component. */
const decodedFields = async (): Promise<Record<string, readonly string[]>> => {
  const wire = (await import(
    new URL("../dist/internal/indexer/wire.js", import.meta.url).href
  )) as Record<string, { readonly fields?: Record<string, unknown> }>;
  return Object.fromEntries(
    Object.entries(wire).flatMap(([name, schema]) =>
      schema.fields === undefined ? [] : [[name, Object.keys(schema.fields)]],
    ),
  );
};

/**
 * Decoded fields the spec does not declare. Missing bigname fields are errors (bigname defines the
 * contract); missing Goldsky fields are notes.
 */
const missing = (id: Id, spec: Spec, fields: Record<string, readonly string[]>): string[] =>
  Object.entries(fields).flatMap(([component, names]) => {
    if (id === "goldsky" && goldskySkipped.has(component)) return [];
    const name = id === "goldsky" ? (goldskyAliases[component] ?? component) : component;
    const declared = spec.components.schemas[name]?.properties;
    if (declared === undefined) return [`${id}: component ${name} is missing`];
    return names
      .filter((field) => !(field in declared))
      .map((field) => `${id}: ${name}.${field} is missing`);
  });

const command = process.argv[2];

if (command === "refresh") {
  const entries = Object.entries(indexers) as [Id, readonly string[]][];
  const fetched = await Promise.all(entries.map(([, urls]) => Promise.all(urls.map(fetchSpec))));
  const metadata: Record<string, unknown> = {};
  for (const [index, [id, urls]] of entries.entries()) {
    const [primary, ...others] = fetched[index] ?? [];
    if (primary === undefined) continue;
    for (const [position, other] of others.entries()) {
      const a = Object.keys(primary.spec.components.schemas).toSorted().join();
      const b = Object.keys(other.spec.components.schemas).toSorted().join();
      // bigname's Sepolia host can run an older build (e.g. without `/resolvers`).
      if (a !== b) console.warn(`${id}: ${urls[position + 1]} declares different components`);
    }
    writeFileSync(join(folder, `${id}.json`), `${JSON.stringify(primary.spec, null, 2)}\n`);
    metadata[id] = {
      url: urls[0],
      version: primary.spec.info?.version ?? null,
      build: primary.spec.info?.["x-build-sha"] ?? null,
      sha256: createHash("sha256").update(primary.text).digest("hex"),
      retrievedAt: new Date().toISOString(),
    };
  }
  writeFileSync(join(folder, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log("indexer-openapi: snapshots written; review the diff, then run check");
} else if (command === "check" || command === "drift") {
  const fields = await decodedFields();
  const ids = Object.keys(indexers) as Id[];
  const specs = await Promise.all(
    ids.map(async (id) =>
      command === "check" ? snapshot(id) : (await fetchSpec(indexers[id][0])).spec,
    ),
  );
  const problems: string[] = [];
  for (const [index, id] of ids.entries()) {
    const spec = specs[index] as Spec;
    const found = missing(id, spec, fields);
    if (id === "bigname") problems.push(...found);
    else
      for (const note of found.filter((line) => !line.includes(" component ")))
        console.log(`note: ${note}`);
    problems.push(...found.filter((line) => id !== "bigname" && line.includes(" component ")));
  }
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(
    `indexer-openapi: ok (${Object.keys(fields).length} components, ${command === "check" ? "snapshots" : "live specs"})`,
  );
} else {
  console.error("usage: node scripts/indexer-openapi.ts refresh | check | drift");
  process.exit(1);
}
