#!/usr/bin/env node
import { existsSync } from "node:fs";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { Command } from "effect/cli";

import { Anvil } from "./anvil/Anvil.ts";
import { cli } from "./cli.ts";
import { packageDir } from "./package.ts";

// The repository's .env holds ENSFORGE_MAINNET_RPC_URL for `artifacts refresh`.
if (existsSync(`${packageDir}../../.env`)) process.loadEnvFile(`${packageDir}../../.env`);

const report = (lines: readonly string[]) =>
  Console.error(lines.join("\n")).pipe(Effect.andThen(Effect.sync(() => (process.exitCode = 1))));

cli.pipe(
  Command.run({ version: "1.0.0" }),
  Effect.catchTags({
    AnvilError: ({ message }) => report([`anvil: ${message}`]),
    ArtifactError: ({ artifact, message }) => report([`${artifact}: ${message}`]),
    DeployError: ({ step, message }) => report([`step ${step}: ${message}`]),
    VerifyFailed: ({ profile, problems }) => report([...problems, `verify ${profile}: failed`]),
  }),
  Effect.provide(Anvil.layer.pipe(Layer.provideMerge(NodeServices.layer))),
  NodeRuntime.runMain,
);
