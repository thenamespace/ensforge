import { Effect, FileSystem, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { createPublicClient, http, type Abi, type Hex } from "viem";
import { mainnet } from "viem/chains";

import { ArtifactError } from "../errors.ts";
import { cacheDir, contractsDir } from "../package.ts";
import { compile, type StandardJsonInput } from "./compile.ts";
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

type BuildInfo = { readonly solcVersion: string; readonly input: StandardJsonInput };

const git = (args: readonly string[], cwd?: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make("git", [...args], cwd === undefined ? {} : { cwd }),
    );
    const output = yield* handle.all.pipe(Stream.decodeText(), Stream.mkString);
    const exitCode = yield* handle.exitCode;
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new ArtifactError({
        artifact: "repositories",
        message: `git ${args.join(" ")}: ${output}`,
      });
    }
    return output.trim();
  }).pipe(
    Effect.scoped,
    Effect.catchTag("PlatformError", (cause) =>
      Effect.fail(new ArtifactError({ artifact: "repositories", message: String(cause) })),
    ),
  );

/** A shallow clone of `repository` at its pinned commit, made once under `.cache/repos`. */
const checkout = Effect.fn("checkout")(function* (repository: Repository) {
  const fs = yield* FileSystem.FileSystem;
  const { url, tag, commit } = repositories[repository];
  const dir = `${cacheDir}/repos/${repository}@${commit}`;

  if (!(yield* fs.exists(dir).pipe(Effect.orDie))) {
    yield* git(["clone", "--quiet", "--depth", "1", "--branch", tag, url, dir]);
  }
  const head = yield* git(["rev-parse", "HEAD"], dir);
  if (head !== commit) {
    return yield* new ArtifactError({
      artifact: repository,
      message: `${tag} is ${head}, expected ${commit}; the tag moved`,
    });
  }
  return dir;
});

const readJson = <A>(file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return JSON.parse(yield* fs.readFileString(file)) as A;
  }).pipe(
    Effect.mapError((cause) => new ArtifactError({ artifact: file, message: String(cause) })),
  );

/**
 * Re-derives every artifact from its pinned source. Contracts from the same build compile in one
 * solc run.
 */
export const deriveAll = Effect.fn("deriveAll")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = Object.entries(sources) as [ArtifactName, Source][];
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
    const record = yield* readJson<{ abi: Abi; bytecode?: Hex }>(
      path.join(yield* repositoryDir(source.repository), source.file),
    );
    if (record.bytecode === undefined || record.bytecode === "0x") {
      return yield* new ArtifactError({
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
    entries.filter(([, source]) => source.kind === "build"),
    ([, source]) => (source.kind === "build" ? `${source.repository}:${source.buildInfo}` : ""),
  );
  for (const group of builds.values()) {
    const [, first] = group[0] as [ArtifactName, Extract<Source, { kind: "build" }>];
    const dir = yield* repositoryDir(first.repository);
    const buildInfo = yield* readJson<BuildInfo>(path.join(dir, first.buildInfo));
    const added: Record<string, { content: string }> = {};
    for (const [, source] of group) {
      if (source.kind !== "build") continue;
      for (const [sourceName, file] of Object.entries(source.add ?? {})) {
        added[sourceName] = {
          content: yield* fs
            .readFileString(path.join(dir, file))
            .pipe(
              Effect.mapError(
                (cause) => new ArtifactError({ artifact: file, message: String(cause) }),
              ),
            ),
        };
      }
    }
    const version = buildInfo.solcVersion;
    if (version !== "0.8.25" && version !== "0.8.27") {
      return yield* new ArtifactError({ artifact: first.buildInfo, message: `solc ${version}` });
    }
    const compiled = yield* compile(
      version,
      { ...buildInfo.input, sources: { ...buildInfo.input.sources, ...added } },
      group.map(([, source]) => (source.kind === "build" ? source.contract : "")),
    );
    for (const [name, source] of group) {
      if (source.kind !== "build") continue;
      const { abi, bytecode } = compiled[source.contract] as (typeof compiled)[string];
      derived.set(name, {
        abi,
        bytecode,
        source: { ...source, commit: repositories[source.repository].commit },
      });
    }
  }

  const locals = entries.filter(([, source]) => source.kind === "local");
  if (locals.length > 0) {
    const files = [
      ...new Set(locals.map(([, source]) => (source.kind === "local" ? source.file : ""))),
    ];
    const input: StandardJsonInput = {
      language: "Solidity",
      sources: Object.fromEntries(
        yield* Effect.forEach(files, (file) =>
          fs.readFileString(path.join(contractsDir, file)).pipe(
            Effect.map((content) => [file, { content }] as const),
            Effect.mapError(
              (cause) => new ArtifactError({ artifact: file, message: String(cause) }),
            ),
          ),
        ),
      ),
      settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
    };
    const compiled = yield* compile(
      "0.8.27",
      input,
      locals.map(([, source]) =>
        source.kind === "local" ? `${source.file}:${source.contract}` : "",
      ),
    );
    for (const [name, source] of locals) {
      if (source.kind !== "local") continue;
      const { abi, bytecode } = compiled[
        `${source.file}:${source.contract}`
      ] as (typeof compiled)[string];
      derived.set(name, { abi, bytecode, source });
    }
  }

  const runtimes = entries.filter(([, source]) => source.kind === "runtime");
  if (runtimes.length > 0) {
    const rpcUrl = process.env["ENSFORGE_MAINNET_RPC_URL"];
    if (rpcUrl === undefined || rpcUrl === "") {
      return yield* new ArtifactError({
        artifact: runtimes.map(([name]) => name).join(", "),
        message:
          "set ENSFORGE_MAINNET_RPC_URL (read from the repository's .env) to fetch mainnet code",
      });
    }
    const client = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
    for (const [name, source] of runtimes) {
      if (source.kind !== "runtime") continue;
      const code = yield* Effect.tryPromise({
        try: () => client.getCode({ address: source.address }),
        catch: (cause) => new ArtifactError({ artifact: name, message: String(cause) }),
      });
      if (code === undefined || code === "0x") {
        return yield* new ArtifactError({
          artifact: name,
          message: `no code at ${source.address}`,
        });
      }
      const abi = source.abi === undefined ? [] : derived.get(source.abi as ArtifactName)?.abi;
      if (abi === undefined) {
        return yield* new ArtifactError({ artifact: name, message: `no artifact ${source.abi}` });
      }
      derived.set(name, { abi, bytecode: code, source });
    }
  }

  return derived;
});
