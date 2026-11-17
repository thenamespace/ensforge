import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import type { DevnetInstance } from "@ensforge/test-devnet";
import { keccak256, toHex, type Address } from "viem";

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
      Effect.mapError((cause) => new DockerError({ message: `git ${args[0]}: ${String(cause)}` })),
    );
});

/** The pinned bigname checkout, cloned once into `tests/services/.cache`. */
const source = Effect.gen(function* () {
  const dir = join(cacheDir, `bigname-${bignameSource.tag}`);
  if (!existsSync(join(dir, "Cargo.toml"))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(cacheDir, { recursive: true });
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
  const commit = (yield* git(["-C", dir, "rev-parse", "HEAD"])).trim();
  if (commit !== bignameSource.commit) {
    return yield* new DockerError({
      message: `${dir} is at ${commit}, not bigname ${bignameSource.tag} (${bignameSource.commit})`,
    });
  }
  return dir;
});

/** bigname's Sepolia manifests, rewritten for the devnet (`<family>/v<n>.toml` → text). */
const devnetProfile = (checkout: string, devnet: DevnetInstance) => {
  const sepolia = join(checkout, "manifests", "sepolia", "ethereum", "ens");
  const manifests = new Map<string, string>();
  for (const family of readdirSync(sepolia)) {
    for (const file of readdirSync(join(sepolia, family))) {
      manifests.set(`${family}/${file}`, readFileSync(join(sepolia, family, file), "utf8"));
    }
  }
  return rewriteManifests(manifests, devnet.contracts as Readonly<Record<string, Address>>);
};

/**
 * A bigname image for the devnet's contracts: built from the pinned source with the devnet
 * profile compiled in, and reused while the profile is unchanged. The first build compiles
 * bigname (several minutes); later profiles reuse the cached build directory.
 */
export const bignameImage = Effect.fnUntraced(function* (devnet: DevnetInstance) {
  const checkout = yield* source;
  const profile = devnetProfile(checkout, devnet);
  // The image changes with the profile or the build recipe.
  const fingerprint = keccak256(
    toHex(
      [
        readFileSync(dockerfile, "utf8"),
        ...[...profile].toSorted(([a], [b]) => a.localeCompare(b)).flat(),
      ].join("\0"),
    ),
  ).slice(2, 14);
  const tag = `ensforge-bigname-devnet:${bignameSource.tag}-${fingerprint}`;

  const present = yield* docker(["image", "inspect", "--format", "{{.Id}}", tag]).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
  if (present) return tag;

  const root = join(checkout, "manifests", profileName);
  rmSync(root, { recursive: true, force: true });
  for (const [path, text] of profile) {
    const target = join(root, "ethereum", "ens", path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, text);
  }
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
