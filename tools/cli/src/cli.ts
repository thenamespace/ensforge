import { Command } from "effect/cli";

import { apiReportCommand } from "./commands/apiReport.ts";
import { buildCommand } from "./commands/build.ts";
import { bundleSizeCommand } from "./commands/bundleSize.ts";
import { codegenCommand } from "./commands/codegen.ts";
import { distTypesCommand } from "./commands/distTypes.ts";
import { examplesCommand } from "./commands/examples.ts";
import { lintJsdocCommand } from "./commands/lintJsdoc.ts";
import { openapiCommand } from "./commands/openapi.ts";
import { releaseCommand } from "./commands/release.ts";
import { typeCostCommand } from "./commands/typeCost.ts";
import { verifyCommand } from "./commands/verify.ts";

/**
 * `ensforge-dev`: build and check ensforge packages. Package commands run in their folder;
 * `bundle-size`, `type-cost` and `release` run from the repository root.
 */
export const cli = Command.make("ensforge-dev").pipe(
  Command.withDescription("Build and check ensforge packages"),
  Command.withSubcommands([
    buildCommand,
    verifyCommand,
    apiReportCommand,
    lintJsdocCommand,
    distTypesCommand,
    examplesCommand,
    codegenCommand,
    openapiCommand,
    bundleSizeCommand,
    typeCostCommand,
    releaseCommand,
  ]),
);
