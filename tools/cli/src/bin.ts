#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Array as Arr, Console, Effect, Layer, String as Str } from "effect";
import { Command } from "effect/cli";
import { FetchHttpClient } from "effect/http";

import { cli } from "./cli.ts";
import { Tools } from "./services/Tools.ts";
import { TypeScript } from "./services/TypeScript.ts";
import { Workspace } from "./services/Workspace.ts";

const services = TypeScript.layer.pipe(
  Layer.provideMerge(Tools.layer),
  Layer.provideMerge(Workspace.layer),
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(FetchHttpClient.layer),
);

// Check failures are expected outcomes: print their problems and exit 1, without a stack trace.
const report = (lines: readonly string[]) =>
  Console.error(Arr.join(lines, "\n")).pipe(
    Effect.andThen(Effect.sync(() => (process.exitCode = 1))),
  );

cli.pipe(
  Command.run({ version: "1.0.0" }),
  Effect.catchTags({
    CheckFailed: ({ check, problems }) => report([...problems, `${check}: failed`]),
    ToolFailed: ({ tool, output }) => report([Str.trim(output), `${tool}: failed`]),
    SetupError: ({ message }) => report([message]),
  }),
  Effect.provide(services),
  NodeRuntime.runMain,
);
