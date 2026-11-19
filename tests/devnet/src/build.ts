// Synchronous digest of in-memory data; Effect has no hashing API.
// oxlint-disable-next-line effecttsgo/node-builtin-import
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
  Array as Arr,
  Effect,
  FileSystem,
  Formatter,
  Option,
  Path,
  Record as Rec,
  Schema,
  String as Str,
} from "effect";

import { Anvil } from "./anvil/Anvil.ts";
import { HexSchema } from "./artifacts/json.ts";
import { sources, type ArtifactName } from "./artifacts/sources.ts";
import { devnetClient } from "./client.ts";
import {
  genesisTimestamp,
  runSteps,
  type Ledger,
  type Step,
  type Variant,
} from "./deploy/engine.ts";
import { DeployError } from "./errors.ts";
import { cacheDir, packageDir } from "./package.ts";
import { l2Profiles, profiles, type L2ProfileName, type ProfileName } from "./profiles/profiles.ts";

/** A profile to build: an ENS deployment on the devnet's chain, or an L2 next to it. */
export type BuildName = ProfileName | L2ProfileName;

export const isL2Profile = (name: BuildName): name is L2ProfileName => name in l2Profiles;

const definitionOf = (
  name: BuildName,
): {
  readonly steps: readonly Step[];
  readonly variant?: Variant | undefined;
  readonly chainId?: number | undefined;
} => (isL2Profile(name) ? l2Profiles[name] : profiles[name]);

/**
 * Extra state on top of a profile, e.g. test fixtures. `create` returns fresh steps for one build:
 * `prelaunch` runs before the profile's ENSv2 launch (its `cutover` steps), `postlaunch` after
 * everything, and `output()` is the JSON stored with the build once both ran. `key` must change
 * whenever the seed would produce different state.
 */
export type Seed = {
  readonly key: string;
  readonly create: () => {
    readonly prelaunch: readonly Step[];
    readonly postlaunch: readonly Step[];
    readonly output: () => unknown;
  };
};

/** A built profile: the chain state to load and what was deployed where. */
export type Build = {
  readonly profile: BuildName;
  /** What the seed's `output()` returned, when the build had a seed. */
  readonly seed?: unknown;
  /** anvil `--load-state` file: accounts, blocks and transactions of the build. */
  readonly stateFile: string;
  readonly ledger: Ledger;
  /** Timestamp of the last block the build mined. */
  readonly timestamp: bigint;
};

type StoredBuild = typeof StoredBuild.Type;

const StoredBuild = Schema.Struct({
  ledger: Schema.Array(
    Schema.Tuple([
      Schema.String,
      Schema.Struct({
        address: HexSchema,
        artifact: Schema.declare((value): value is ArtifactName =>
          Arr.some(Rec.keys(sources), (key) => key === value),
        ),
      }),
    ]),
  ),
  timestamp: Schema.String,
  seed: Schema.optional(Schema.Unknown),
});

// Builds depend on the deploy code, the artifacts and anvil itself.
const buildKey = Effect.fn("buildKey")(function* (profile: BuildName) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const hash = createHash("sha256").update(profile);
  for (const dir of ["src/deploy", "src/profiles", "artifacts"]) {
    const entries = yield* fs.readDirectory(path.join(packageDir, dir), { recursive: true });
    const files = Arr.sort(
      Arr.filter(entries, (file) => /\.(ts|json)$/.test(file)),
      Str.Order,
    );
    for (const file of files) {
      const content = yield* fs.readFileString(path.join(packageDir, dir, file));
      hash.update(file).update(content);
    }
  }
  const foundryVersion = yield* fs.readFileString(path.join(packageDir, "foundry-version"));
  hash.update(foundryVersion);
  return Str.slice(0, 16)(hash.digest("hex"));
});

const buildFresh = Effect.fn("buildFresh")(function* (profile: BuildName, seed?: Seed) {
  const anvil = yield* Anvil;
  const definition = definitionOf(profile);
  const { rpcUrl } = yield* anvil.start({
    mining: false,
    timestamp: genesisTimestamp,
    ...(definition.chainId === undefined ? {} : { chainId: definition.chainId }),
  });
  const seeded = seed?.create();
  // A seed's prelaunch steps go right before the ENSv2 launch, or last when there is none.
  const split = Arr.findFirstIndex(definition.steps, (step) =>
    Str.startsWith("cutover")(step.id),
  ).pipe(Option.getOrElse(() => definition.steps.length));
  const steps =
    seeded === undefined
      ? definition.steps
      : [
          ...definition.steps.slice(0, split),
          ...seeded.prelaunch,
          ...definition.steps.slice(split),
          ...seeded.postlaunch,
        ];
  const ledger = yield* runSteps(rpcUrl, steps, definition.variant);

  const client = devnetClient(rpcUrl);
  const dump = yield* Effect.tryPromise({
    try: () => client.dumpState(),
    catch: (cause) => DeployError.make({ step: "dump", message: String(cause) }),
  });
  const block = yield* Effect.tryPromise({
    try: () => client.getBlock(),
    catch: (cause) => DeployError.make({ step: "dump", message: String(cause) }),
  });
  return {
    // `dumpState` returns the `--dump-state` JSON, gzipped and hex-encoded.
    state: gunzipSync(Buffer.from(Str.slice(2)(dump), "hex")).toString("utf8"),
    ledger,
    timestamp: block.timestamp,
    seed: seeded?.output(),
  };
}, Effect.scoped);

/**
 * The profile's build, from `.cache/dumps` when its inputs are unchanged. Parallel builds of the
 * same profile each write complete files and the last rename wins, so readers never see a partial
 * one.
 */
export const build = Effect.fn("build")(function* (
  profile: BuildName,
  options: { readonly force?: boolean; readonly seed?: Seed } = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const key = yield* buildKey(profile);
  const seedKey =
    options.seed === undefined
      ? ""
      : `-${Str.slice(0, 16)(createHash("sha256").update(options.seed.key).digest("hex"))}`;
  const base = `${cacheDir}/dumps/${profile}-${key}${seedKey}`;
  const stateFile = `${base}.state.json`;
  const buildFile = `${base}.json`;

  if (options.force !== true && (yield* fs.exists(buildFile))) {
    const text = yield* fs.readFileString(buildFile);
    const stored = yield* Schema.decodeEffect(Schema.fromJsonString(StoredBuild))(text).pipe(
      Effect.mapError((cause) => DeployError.make({ step: "build", message: String(cause) })),
    );
    return {
      profile,
      stateFile,
      ledger: new Map(stored.ledger),
      timestamp: BigInt(stored.timestamp),
      seed: stored.seed,
    } satisfies Build;
  }

  const fresh = yield* buildFresh(profile, options.seed);
  const stored: StoredBuild = {
    ledger: [...fresh.ledger],
    timestamp: String(fresh.timestamp),
    seed: fresh.seed,
  };
  yield* fs.makeDirectory(`${cacheDir}/dumps`, { recursive: true });
  // The build file is written last: its presence means the state file is complete.
  for (const [file, content] of [
    [stateFile, fresh.state],
    [buildFile, Formatter.formatJson(stored)],
  ] as const) {
    const partial = `${file}.${process.pid}.tmp`;
    yield* fs.writeFileString(partial, content);
    yield* fs.rename(partial, file);
  }
  return {
    profile,
    stateFile,
    ledger: fresh.ledger,
    timestamp: fresh.timestamp,
    seed: fresh.seed,
  } satisfies Build;
});
