import { Command } from "effect/cli";

import { artifactsCommand } from "./commands/artifacts.ts";
import { buildCommand } from "./commands/build.ts";
import { profileCommand, startCommand } from "./commands/start.ts";

export const cli = Command.make("ensforge-devnet").pipe(
  Command.withDescription("Local ENS deployments for ensforge's chain test suites"),
  Command.withSubcommands([buildCommand, startCommand, profileCommand, artifactsCommand]),
);
