import {
  Array as Arr,
  Config,
  Effect,
  FileSystem,
  Option,
  Path,
  Record as Rec,
  Schema,
  Stream,
  String as Str,
} from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { createPublicClient, http, type Abi, type Hex } from "viem";
import { mainnet } from "viem/chains";

import { ArtifactError } from "../errors.ts";
import { cacheDir, contractsDir } from "../package.ts";
import { compile, type StandardJsonInput } from "./compile.ts";
import { AbiSchema, HexSchema, readJson } from "./json.ts";
import {
  repositories,
  sources,
  type ArtifactName,
  type Repository,
  type Source,
} from "./sources.ts";

/** A committed artifact: creation code, ABI and where both came from. */
export type Artifact = {
  readonly abi: Abi;
  readonly bytecode: Hex;
  readonly source: Source & { readonly commit?: string };
};

const git = (args: readonly string[], cwd?: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make("git", [...args], cwd === undefined ? {} : { cwd }),
    );
    const output = yield* handle.all.pipe(Stream.decodeText(), Stream.mkString);
    const exitCode = yield* handle.exitCode;
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* ArtifactError.make({
        artifact: "repositories",
        message: `git ${Arr.join(args, " ")}: ${output}`,
      });
    }
    return Str.trim(output);
  }).pipe(
    Effect.scoped,
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(ArtifactError.make({ artifact: "repositories", message: String(cause) })),
    ),
  );

/** A shallow clone of `repository` at its pinned commit, made once under `.cache/repos`. */
const checkout = Effect.fn("checkout")(function* (repository: Repository) {
  const fs = yield* FileSystem.FileSystem;
  const pinned = repositories[repository];
  const dir = `${cacheDir}/repos/${repository}@${pinned.commit}`;

  if (!(yield* fs.exists(dir).pipe(Effect.orDie))) {
    if ("tag" in pinned) {
      yield* git(["clone", "--quiet", "--depth", "1", "--branch", pinned.tag, pinned.url, dir]);
    } else {
      // A branch moves on, so its pinned commit is fetched by hash.
      yield* git(["init", "--quiet", dir]);
      yield* git(["fetch", "--quiet", "--depth", "1", pinned.url, pinned.commit], dir);
      yield* git(["checkout", "--quiet", "FETCH_HEAD"], dir);
    }
  }
  const head = yield* git(["rev-parse", "HEAD"], dir);
  if (head !== pinned.commit) {
    return yield* ArtifactError.make({
      artifact: repository,
      message:
        "tag" in pinned
          ? `${pinned.tag} is ${head}, expected ${pinned.commit}; the tag moved`
          : `${dir} is at ${head}, expected ${pinned.commit}; remove it`,
    });
  }
  return dir;
});

const Deployment = Schema.Struct({ abi: AbiSchema, bytecode: Schema.optional(HexSchema) });

const SourcifyContract = Schema.Struct({
  match: Schema.NullOr(Schema.String),
  abi: AbiSchema,
  creationBytecode: Schema.Struct({ recompiledBytecode: HexSchema }),
});

/** The ABI and recompiled creation code of an exact Sourcify match. */
const fromSourcify = Effect.fnUntraced(function* (
  name: ArtifactName,
  source: Extract<Source, { readonly kind: "sourcify" }>,
) {
  const url = `https://sourcify.dev/server/v2/contract/${source.chainId}/${source.address}?fields=abi,creationBytecode`;
  const contract = yield* HttpClient.get(url).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.text),
    Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(SourcifyContract))),
    Effect.mapError((cause) => ArtifactError.make({ artifact: name, message: String(cause) })),
  );
  if (contract.match !== "exact_match") {
    return yield* ArtifactError.make({
      artifact: name,
      message: `${source.address} on ${source.chainId} is a ${contract.match ?? "missing"} match`,
    });
  }
  return { abi: contract.abi, bytecode: contract.creationBytecode.recompiledBytecode, source };
});

const BuildInfo = Schema.Struct({
  solcVersion: Schema.String,
  input: Schema.Struct({
    language: Schema.Literal("Solidity"),
    sources: Schema.Record(Schema.String, Schema.Struct({ content: Schema.String })),
    settings: Schema.Record(Schema.String, Schema.Unknown),
  }),
});

/**
 * Re-derives every artifact from its pinned source. Contracts from the same build compile in one
 * solc run.
 */
export const deriveAll = Effect.fn("deriveAll")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries: [ArtifactName, Source][] = Rec.toEntries(sources);
  const derived = new Map<ArtifactName, Artifact>();
  const dirs = new Map<Repository, string>();
  const repositoryDir = Effect.fnUntraced(function* (repository: Repository) {
    const known = dirs.get(repository);
    if (known !== undefined) return known;
    const dir = yield* checkout(repository);
    dirs.set(repository, dir);
    return dir;
  });

  for (const [name, source] of entries) {
    if (source.kind !== "deployment") continue;
    const repositoryPath = yield* repositoryDir(source.repository);
    const record = yield* readJson(path.join(repositoryPath, source.file), Deployment);
    if (record.bytecode === undefined || record.bytecode === "0x") {
      return yield* ArtifactError.make({
        artifact: name,
        message: `${source.file} has no bytecode`,
      });
    }
    derived.set(name, {
      abi: record.abi,
      bytecode: record.bytecode,
      source: { ...source, commit: repositories[source.repository].commit },
    });
  }

  const builds = Map.groupBy(
    Arr.filter(entries, ([, source]) => source.kind === "build"),
    ([, source]) => (source.kind === "build" ? `${source.repository}:${source.buildInfo}` : ""),
  );
  for (const group of builds.values()) {
    const first = group[0]?.[1];
    if (first?.kind !== "build") continue;
    const dir = yield* repositoryDir(first.repository);
    const buildInfo = yield* readJson(path.join(dir, first.buildInfo), BuildInfo);
    const added: Record<string, { content: string }> = {};
    const readSource = (file: string) =>
      fs
        .readFileString(file)
        .pipe(
          Effect.mapError((cause) =>
            ArtifactError.make({ artifact: file, message: String(cause) }),
          ),
        );
    for (const [, source] of group) {
      if (source.kind !== "build") continue;
      for (const [sourceName, file] of Rec.toEntries(source.add ?? {})) {
        const content = yield* readSource(path.join(dir, file));
        added[sourceName] = { content };
      }
      for (const [sourceName, file] of Rec.toEntries(source.local ?? {})) {
        const content = yield* readSource(path.join(contractsDir, file));
        added[sourceName] = { content };
      }
    }
    const version = buildInfo.solcVersion;
    if (version !== "0.8.25" && version !== "0.8.27") {
      return yield* ArtifactError.make({ artifact: first.buildInfo, message: `solc ${version}` });
    }
    const compiled = yield* compile(
      version,
      { ...buildInfo.input, sources: { ...buildInfo.input.sources, ...added } },
      Arr.map(group, ([, source]) => (source.kind === "build" ? source.contract : "")),
    );
    for (const [name, source] of group) {
      if (source.kind !== "build") continue;
      const built = compiled[source.contract];
      if (built === undefined) {
        return yield* ArtifactError.make({
          artifact: name,
          message: `${source.contract} was not compiled`,
        });
      }
      const { abi, bytecode } = built;
      derived.set(name, {
        abi,
        bytecode,
        source: { ...source, commit: repositories[source.repository].commit },
      });
    }
  }

  const locals = Arr.filter(entries, ([, source]) => source.kind === "local");
  if (locals.length > 0) {
    const files = [
      ...new Set(Arr.map(locals, ([, source]) => (source.kind === "local" ? source.file : ""))),
    ];
    const localSources = yield* Effect.forEach(
      files,
      (file) =>
        fs.readFileString(path.join(contractsDir, file)).pipe(
          Effect.mapBoth({
            onSuccess: (content) => [file, { content }] as const,
            onFailure: (cause) => ArtifactError.make({ artifact: file, message: String(cause) }),
          }),
        ),
      { concurrency: 1 },
    );
    const input: StandardJsonInput = {
      language: "Solidity",
      sources: Rec.fromEntries(localSources),
      settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
    };
    const compiled = yield* compile(
      "0.8.27",
      input,
      Arr.map(locals, ([, source]) =>
        source.kind === "local" ? `${source.file}:${source.contract}` : "",
      ),
    );
    for (const [name, source] of locals) {
      if (source.kind !== "local") continue;
      const built = compiled[`${source.file}:${source.contract}`];
      if (built === undefined) {
        return yield* ArtifactError.make({
          artifact: name,
          message: `${source.contract} was not compiled`,
        });
      }
      derived.set(name, { abi: built.abi, bytecode: built.bytecode, source });
    }
  }

  const runtimes = Arr.filter(entries, ([, source]) => source.kind === "runtime");
  if (runtimes.length > 0) {
    const rpcUrl = yield* Config.String("ENSFORGE_MAINNET_RPC_URL").pipe(Config.withDefault(""));
    if (rpcUrl === "") {
      return yield* ArtifactError.make({
        artifact: Arr.join(
          Arr.map(runtimes, ([name]) => name),
          ", ",
        ),
        message:
          "set ENSFORGE_MAINNET_RPC_URL (read from the repository's .env) to fetch mainnet code",
      });
    }
    const client = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
    for (const [name, source] of runtimes) {
      if (source.kind !== "runtime") continue;
      const code = yield* Effect.tryPromise({
        try: () => client.getCode({ address: source.address }),
        catch: (cause) => ArtifactError.make({ artifact: name, message: String(cause) }),
      });
      if (code === undefined || code === "0x") {
        return yield* ArtifactError.make({
          artifact: name,
          message: `no code at ${source.address}`,
        });
      }
      const abiSource = source.abi;
      const abiName = Arr.findFirst(entries, ([entryName]) => entryName === abiSource);
      const abi =
        abiSource === undefined
          ? []
          : Option.match(abiName, {
              onNone: () => undefined,
              onSome: ([entryName]) => derived.get(entryName)?.abi,
            });
      if (abi === undefined) {
        return yield* ArtifactError.make({ artifact: name, message: `no artifact ${source.abi}` });
      }
      derived.set(name, { abi, bytecode: code, source });
    }
  }

  for (const [name, source] of entries) {
    if (source.kind !== "sourcify") continue;
    const artifact = yield* fromSourcify(name, source);
    derived.set(name, artifact);
  }

  return derived;
});
