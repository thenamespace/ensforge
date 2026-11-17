import { Schema } from "effect";

/** A check found problems; each is one line for the report. */
export class CheckFailed extends Schema.TaggedError<CheckFailed>()("CheckFailed", {
  check: Schema.String,
  problems: Schema.Array(Schema.String),
}) {}

/** A tool the CLI runs (tsc, oxfmt, a bundler) failed or could not start. */
export class ToolFailed extends Schema.TaggedError<ToolFailed>()("ToolFailed", {
  tool: Schema.String,
  output: Schema.String,
}) {}

/** The package or repository is not set up as the CLI expects. */
export class SetupError extends Schema.TaggedError<SetupError>()("SetupError", {
  message: Schema.String,
}) {}
