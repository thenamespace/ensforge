#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { Command } from "effect/cli";

import { cli } from "./cli.ts";
import { Tools } from "./services/Tools.ts";
import { TypeScript } from "./services/TypeScript.ts";
import { Workspace } from "./services/Workspace.ts";

const services = TypeScript.layer.pipe(
  Layer.provideMerge(Tools.layer),
  Layer.provideMerge(Workspace.layer),
  Layer.provideMerge(NodeServices.layer),
);

// Check failures are expected outcomes: print their problems and exit 1, without a stack trace.
const report = (lines: readonly string[]) =>
  Console.error(lines.join("\n")).pipe(Effect.andThen(Effect.sync(() => (process.exitCode = 1))));

cli.pipe(
  Command.run({ version: "1.0.0" }),
  Effect.catchTags({
    CheckFailed: ({ check, problems }) => report([...problems, `${check}: failed`]),
    ToolFailed: ({ tool, output }) => report([output.trim(), `${tool}: failed`]),
    SetupError: ({ message }) => report([message]),
  }),
  Effect.provide(services),
  NodeRuntime.runMain,
);
