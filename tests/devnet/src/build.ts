import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { Effect, FileSystem, Path } from "effect";

import type { Address } from "viem";

import { Anvil } from "./anvil/Anvil.ts";
import type { ArtifactName } from "./artifacts/sources.ts";
import { devnetClient } from "./client.ts";
import { genesisTimestamp, runSteps, type Ledger } from "./deploy/engine.ts";
import { DeployError } from "./errors.ts";
import { cacheDir, packageDir } from "./package.ts";
import { profiles, type ProfileDefinition, type ProfileName } from "./profiles/profiles.ts";

/** A built profile: the chain state to load and what was deployed where. */
export type Build = {
  readonly profile: ProfileName;
  /** anvil `--load-state` file: accounts, blocks and transactions of the build. */
  readonly stateFile: string;
  readonly ledger: Ledger;
  /** Timestamp of the last block the build mined. */
  readonly timestamp: bigint;
};

type StoredBuild = {
  readonly ledger: readonly (readonly [string, { address: Address; artifact: ArtifactName }])[];
  readonly timestamp: string;
};

// Builds depend on the deploy code, the artifacts and anvil itself.
const buildKey = Effect.fn("buildKey")(function* (profile: ProfileName) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const hash = createHash("sha256").update(profile);
  for (const dir of ["src/deploy", "src/profiles", "artifacts"]) {
    const files = (yield* fs.readDirectory(path.join(packageDir, dir), { recursive: true }))
      .filter((file) => /\.(ts|json)$/.test(file))
      .toSorted();
    for (const file of files) {
      hash.update(file).update(yield* fs.readFileString(path.join(packageDir, dir, file)));
    }
  }
  hash.update(yield* fs.readFileString(path.join(packageDir, "foundry-version")));
  return hash.digest("hex").slice(0, 16);
});

const read = <A>(action: () => Promise<A>) =>
  Effect.tryPromise({
    try: action,
    catch: (cause) => new DeployError({ step: "dump", message: String(cause) }),
  });

const buildFresh = Effect.fn("buildFresh")(function* (profile: ProfileName) {
  const anvil = yield* Anvil;
  const { rpcUrl } = yield* anvil.start({ mining: false, timestamp: genesisTimestamp });
  const definition: ProfileDefinition = profiles[profile];
  const ledger = yield* runSteps(rpcUrl, definition.steps, definition.variant);

  const client = devnetClient(rpcUrl);
  // `dumpState` returns the `--dump-state` JSON, gzipped and hex-encoded.
  const dump = yield* read(() => client.dumpState());
  const block = yield* read(() => client.getBlock());
  return {
    state: gunzipSync(Buffer.from(dump.slice(2), "hex")).toString("utf8"),
    ledger,
    timestamp: BigInt(block.timestamp),
  };
}, Effect.scoped);

/**
 * The profile's build, from `.cache/dumps` when its inputs are unchanged. Parallel builds of the
 * same profile each write complete files and the last rename wins, so readers never see a partial
 * one.
 */
export const build = Effect.fn("build")(function* (
  profile: ProfileName,
  options: { readonly force?: boolean } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const base = `${cacheDir}/dumps/${profile}-${yield* buildKey(profile)}`;
  const stateFile = `${base}.state.json`;
  const buildFile = `${base}.json`;

  if (options.force !== true && (yield* fs.exists(buildFile))) {
    const stored = JSON.parse(yield* fs.readFileString(buildFile)) as StoredBuild;
    return {
      profile,
      stateFile,
      ledger: new Map(stored.ledger),
      timestamp: BigInt(stored.timestamp),
    } satisfies Build;
  }

  const fresh = yield* buildFresh(profile);
  const stored: StoredBuild = { ledger: [...fresh.ledger], timestamp: String(fresh.timestamp) };
  yield* fs.makeDirectory(`${cacheDir}/dumps`, { recursive: true });
  // The build file is written last: its presence means the state file is complete.
  for (const [file, content] of [
    [stateFile, fresh.state],
    [buildFile, JSON.stringify(stored)],
  ] as const) {
    const partial = `${file}.${process.pid}.tmp`;
    yield* fs.writeFileString(partial, content);
    yield* fs.rename(partial, file);
  }
  return { profile, stateFile, ledger: fresh.ledger, timestamp: fresh.timestamp } satisfies Build;
});
