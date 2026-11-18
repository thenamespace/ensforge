import { fileURLToPath } from "node:url";

import {
  Config,
  Console,
  Effect,
  FileSystem,
  Order,
  Path,
  String as Str,
  pipe,
  Array as Arr,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import type { DevnetInstance } from "@ensforge/test-devnet";
import { keccak256, toHex } from "viem";

import { docker, DockerError } from "./docker.ts";
import { bignameSource } from "./images.ts";
import { rewriteManifests } from "./manifests.ts";

const cacheDir = fileURLToPath(new URL("../../.cache/", import.meta.url));
const dockerfile = fileURLToPath(new URL("../../bigname/Dockerfile", import.meta.url));

/** bigname's build looks for an extra profile under this name in `manifests/`. */
const profileName = ".bigname-e2e-runtime-profile-devnet";

const git = Effect.fnUntraced(function* (args: readonly string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner
    .string(ChildProcess.make("git", args))
    .pipe(
      Effect.mapError((cause) => DockerError.make({ message: `git ${args[0]}: ${String(cause)}` })),
    );
});

/** The pinned bigname checkout, cloned once into `tests/services/.cache`. */
const source = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = path.join(cacheDir, `bigname-${bignameSource.tag}`);
  if (!(yield* fs.exists(path.join(dir, "Cargo.toml")))) {
    yield* fs.remove(dir, { recursive: true, force: true });
    yield* fs.makeDirectory(cacheDir, { recursive: true });
    yield* git([
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--branch",
      bignameSource.tag,
      bignameSource.repository,
      dir,
    ]);
  }
  const head = yield* git(["-C", dir, "rev-parse", "HEAD"]);
  const commit = Str.trim(head);
  if (commit !== bignameSource.commit) {
    return yield* DockerError.make({
      message: `${dir} is at ${commit}, not bigname ${bignameSource.tag} (${bignameSource.commit})`,
    });
  }
  return dir;
});

/**
 * A bigname image for the devnet's contracts: built from the pinned source with the devnet
 * profile compiled in, and reused while the profile is unchanged. The first build compiles
 * bigname (several minutes); later profiles reuse the cached build directory.
 */
export const bignameImage = Effect.fnUntraced(function* (devnet: DevnetInstance) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const checkout = yield* source;
  // bigname's Sepolia manifests (`<family>/v<n>.toml`), rewritten for the devnet.
  const sepolia = path.join(checkout, "manifests", "sepolia", "ethereum", "ens");
  const manifests = new Map<string, string>();
  for (const family of yield* fs.readDirectory(sepolia)) {
    for (const file of yield* fs.readDirectory(path.join(sepolia, family))) {
      const manifest = yield* fs.readFileString(path.join(sepolia, family, file));
      manifests.set(`${family}/${file}`, manifest);
    }
  }
  const recipe = yield* fs.readFileString(dockerfile);
  const profile = rewriteManifests(manifests, devnet.contracts);

  // The image changes with the profile or the build recipe.
  const fingerprint = pipe(
    keccak256(
      toHex(
        Arr.join(
          [
            recipe,
            ...Arr.sort(
              [...profile],
              Order.make<readonly [string, unknown]>(([a], [b]) => pipe(a, Str.localeCompare(b))),
            ).flat(),
          ],
          "\0",
        ),
      ),
    ),
    Str.slice(2, 14),
  );
  const tag = `ensforge-bigname-devnet:${bignameSource.tag}-${fingerprint}`;

  const present = yield* docker(["image", "inspect", "--format", "{{.Id}}", tag]).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
  if (present) return tag;

  // A registry the `bigname-image` workflow published to: pull the same build instead of compiling.
  const registry = yield* Config.String("ENSFORGE_BIGNAME_REGISTRY").pipe(
    Config.withDefault(""),
    Effect.orDie,
  );
  if (registry !== "") {
    const published = `${registry}:${bignameSource.tag}-${fingerprint}`;
    const pulled = yield* docker(["pull", "--quiet", published]).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    if (pulled) {
      yield* docker(["tag", published, tag]);
      return tag;
    }
    yield* Console.log(`${published} is not published; building it here`);
  }

  const root = path.join(checkout, "manifests", profileName);
  yield* fs.remove(root, { recursive: true, force: true });
  for (const [manifest, text] of profile) {
    const target = path.join(root, "ethereum", "ens", manifest);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, text);
  }
  // The build prints nothing until it ends; say why a cold run looks idle.
  yield* Console.log(
    `building ${tag} (a cold build compiles bigname: up to ~30 minutes; the bigname-image workflow publishes it)`,
  );
  yield* docker([
    "build",
    "--file",
    dockerfile,
    "--build-arg",
    `BIGNAME_BUILD_SHA=${bignameSource.commit}`,
    "--tag",
    tag,
    checkout,
  ]);
  return tag;
});
