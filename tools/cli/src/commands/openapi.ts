// oxlint-disable-next-line effecttsgo/node-builtin-import -- synchronous digest of in-memory data; Effect has no hashing API
import { createHash } from "node:crypto";

import {
  Array as Arr,
  Console,
  DateTime,
  Effect,
  FileSystem,
  Formatter,
  Path,
  Record as Rec,
  Schema,
} from "effect";
import { Argument, Command } from "effect/cli";
import { HttpClient, HttpClientResponse } from "effect/http";

import { CheckFailed, SetupError, ToolFailed } from "../errors.ts";
import { Workspace } from "../services/Workspace.ts";

const Spec = Schema.Struct({
  info: Schema.optionalKey(
    Schema.Struct({
      version: Schema.optionalKey(Schema.String),
      "x-build-sha": Schema.optionalKey(Schema.String),
    }),
  ),
  components: Schema.Struct({
    schemas: Schema.Record(
      Schema.String,
      Schema.Struct({
        properties: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
      }),
    ),
  }),
});
type Spec = typeof Spec.Type;
const decodeSpec = Schema.decodeUnknownEffect(Schema.fromJsonString(Spec));

const indexers = {
  bigname: ["https://api.bigname.sh/openapi.json", "https://sepolia.api.bigname.sh/openapi.json"],
  goldsky: ["https://ens-api.goldsky.com/openapi.json"],
} as const;
type Id = keyof typeof indexers;
const ids = Rec.keys(indexers);

// Goldsky names some components differently, composes RegistryLabel (allOf) and has no
// `/resolvers` route. Fields it leaves out decode as missing, so they are only reported.
const goldskyAliases: Readonly<Record<string, string>> = {
  EnsV1: "EnsV1Facts",
  Namespace: "NamespaceData",
  PermissionRow: "Permission",
};
const goldskySkipped = new Set(["RegistryLabel", "RoleHolderResolver"]);

const fetchSpec = Effect.fn("openapi.fetchSpec")(function* (url: string) {
  const text = yield* HttpClient.get(url).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.text),
    Effect.mapError((cause) => ToolFailed.make({ tool: `fetch ${url}`, output: String(cause) })),
  );
  const spec = yield* decodeSpec(text).pipe(
    Effect.mapError((cause) => SetupError.make({ message: `${url}: ${String(cause)}` })),
  );
  return { text, spec };
});

/**
 * Decoded fields the spec does not declare. Missing bigname fields are errors (bigname defines the
 * contract); missing Goldsky fields are notes, except whole components.
 */
const missing = (id: Id, spec: Spec, fields: Readonly<Record<string, readonly string[]>>) =>
  Arr.flatMap(Rec.toEntries(fields), ([component, names]) => {
    if (id === "goldsky" && goldskySkipped.has(component)) return [];
    const name = id === "goldsky" ? (goldskyAliases[component] ?? component) : component;
    const declared = spec.components.schemas[name]?.properties;
    if (declared === undefined)
      return [{ fatal: true, line: `${id}: component ${name} is missing` }];
    return Arr.map(
      Arr.filter(names, (field) => !(field in declared)),
      (field) => ({ fatal: id === "bigname", line: `${id}: ${name}.${field} is missing` }),
    );
  });

/**
 * Pins the OpenAPI contracts of the built-in indexers: `refresh` fetches them into
 * `verify/openapi`, `check` compares the SDK's built wire Schemas with the snapshots
 * (offline), `drift` with the live specs.
 */
export const openapi = Effect.fn("openapi")(function* (mode: "check" | "drift" | "refresh") {
  const workspace = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = path.join(workspace.packageDir, "verify/openapi");

  if (mode === "refresh") {
    const metadata: Record<string, unknown> = {};
    for (const id of ids) {
      const [primaryUrl, ...otherUrls] = indexers[id];
      const primary = yield* fetchSpec(primaryUrl);
      for (const url of otherUrls) {
        const other = yield* fetchSpec(url);
        // bigname's Sepolia host can run an older build (e.g. without `/resolvers`).
        if (
          Arr.join(Rec.keys(primary.spec.components.schemas), ",") !==
          Arr.join(Rec.keys(other.spec.components.schemas), ",")
        )
          yield* Console.warn(`${id}: ${url} declares different components`);
      }
      yield* fs.writeFileString(
        path.join(folder, `${id}.json`),
        `${Formatter.formatJson(primary.spec, { space: 2 })}\n`,
      );
      const now = yield* DateTime.now;
      metadata[id] = {
        url: primaryUrl,
        version: primary.spec.info?.version ?? null,
        build: primary.spec.info?.["x-build-sha"] ?? null,
        sha256: createHash("sha256").update(primary.text).digest("hex"),
        retrievedAt: DateTime.formatIso(now),
      };
    }
    yield* fs.writeFileString(
      path.join(folder, "metadata.json"),
      `${Formatter.formatJson(metadata, { space: 2 })}\n`,
    );
    return yield* Console.log("openapi: snapshots written; review the diff, then run check");
  }

  // Field names each built wire Schema decodes, by OpenAPI component.
  const wire = yield* Effect.tryPromise({
    try: (): Promise<Record<string, { readonly fields?: Record<string, unknown> }>> =>
      import(`file://${path.join(workspace.packageDir, "dist/internal/indexer/wire.js")}`),
    catch: (cause) => SetupError.make({ message: `Build the package first: ${String(cause)}` }),
  });
  const fields = Rec.fromEntries(
    Arr.flatMap(Rec.toEntries(wire), ([name, schema]) =>
      schema.fields === undefined ? [] : [[name, Rec.keys(schema.fields)]],
    ),
  );

  const problems: string[] = [];
  for (const id of ids) {
    const spec =
      mode === "check"
        ? yield* fs.readFileString(path.join(folder, `${id}.json`)).pipe(
            Effect.flatMap(decodeSpec),
            Effect.mapError((cause) =>
              SetupError.make({ message: `${id}.json: ${String(cause)}` }),
            ),
          )
        : (yield* fetchSpec(indexers[id][0])).spec;
    for (const { fatal, line } of missing(id, spec, fields)) {
      if (fatal) problems.push(line);
      else yield* Console.log(`note: ${line}`);
    }
  }
  if (problems.length > 0) return yield* CheckFailed.make({ check: "openapi", problems });
  return yield* Console.log(
    `openapi: ok (${Rec.keys(fields).length} components, ${mode === "check" ? "snapshots" : "live specs"})`,
  );
});

export const openapiCommand = Command.make(
  "openapi",
  {
    mode: Argument.Literals("mode", ["check", "drift", "refresh"]).pipe(
      Argument.withDescription("check (offline), drift (live specs) or refresh (write snapshots)"),
    ),
  },
  ({ mode }) => openapi(mode),
).pipe(Command.withDescription("Check the indexer wire Schemas against the OpenAPI specs"));
