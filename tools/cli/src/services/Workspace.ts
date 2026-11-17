import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";

import { SetupError } from "../errors.ts";

/** One published entry of a package, e.g. `./indexer`. */
export type Entry = {
  /** Export subpath: `.`, `./effect`, `./v2/experimental/hca`. */
  readonly subpath: string;
  /** Report name: `index`, `effect`, `v2/experimental/hca`. */
  readonly name: string;
  readonly source: string;
  readonly declaration: string;
  readonly module: string;
};

/** What `ensforge-dev verify` checks for a package (`"ensforge"` in its package.json). */
const Config = Schema.Struct({
  /** Entries with JSDoc lint and an API report. */
  api: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Entries whose declarations must not import `effect` (Promise users never need it). */
  effectFree: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Generated action barrels and decorators. */
  codegen: Schema.optionalKey(Schema.Literals(["sdk", "extension"])),
  /** Indexer OpenAPI snapshots under test/fixtures/openapi. */
  openapi: Schema.optionalKey(Schema.Boolean),
});
export type Config = typeof Config.Type;

const Manifest = Schema.Struct({
  name: Schema.String,
  exports: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  ensforge: Schema.optionalKey(Config),
});

const ExportTarget = Schema.Struct({
  "workspace-source": Schema.String,
  default: Schema.String,
});

/** The repository root and the package the command runs in (its working directory). */
export class Workspace extends Context.Service<
  Workspace,
  {
    readonly root: string;
    readonly packageDir: string;
    readonly name: string;
    readonly entries: readonly Entry[];
    readonly config: Config;
    /** The entries listed under a config key, in its order. */
    readonly entriesOf: (subpaths: readonly string[] | undefined) => readonly Entry[];
  }
>()("@ensforge/tools/Workspace") {
  static readonly layer = Layer.effect(
    Workspace,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const packageDir = process.cwd();

      let root = packageDir;
      while (!(yield* fs.exists(path.join(root, "pnpm-workspace.yaml")))) {
        const parent = path.dirname(root);
        if (parent === root)
          return yield* new SetupError({ message: "Run inside the ensforge repository." });
        root = parent;
      }

      const manifest = yield* fs.readFileString(path.join(packageDir, "package.json")).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest))),
        Effect.mapError((cause) => new SetupError({ message: `package.json: ${String(cause)}` })),
      );

      const entries = Object.entries(manifest.exports ?? {}).flatMap(([subpath, target]) => {
        const decoded = Schema.decodeUnknownOption(ExportTarget)(target);
        if (decoded._tag === "None") return [];
        const module = path.join(packageDir, decoded.value.default);
        return [
          {
            subpath,
            name: subpath === "." ? "index" : subpath.slice(2),
            source: path.join(packageDir, decoded.value["workspace-source"]),
            declaration: module.replace(/\.js$/, ".d.ts"),
            module,
          },
        ];
      });
      const config = manifest.ensforge ?? {};

      return Workspace.of({
        root,
        packageDir,
        name: manifest.name,
        entries,
        config,
        entriesOf: (subpaths) =>
          (subpaths ?? []).flatMap((subpath) =>
            entries.filter((entry) => entry.subpath === subpath),
          ),
      });
    }),
  );
}
