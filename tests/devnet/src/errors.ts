import { Schema } from "effect";

/** anvil is missing, the wrong version, or did not start. */
export class AnvilError extends Schema.TaggedError<AnvilError, { readonly brand: unique symbol }>()(
  "AnvilError",
  { message: Schema.String },
) {}

/** A committed artifact is missing or out of date, or could not be re-derived. */
export class ArtifactError extends Schema.TaggedError<
  ArtifactError,
  { readonly brand: unique symbol }
>()("ArtifactError", { artifact: Schema.String, message: Schema.String }) {}

/** A deployment step failed: a transaction reverted or an RPC call failed. */
export class DeployError extends Schema.TaggedError<
  DeployError,
  { readonly brand: unique symbol }
>()("DeployError", { step: Schema.String, message: Schema.String }) {}

/** `devnet verify` found the deployment wired differently from its profile. */
export class VerifyFailed extends Schema.TaggedError<
  VerifyFailed,
  { readonly brand: unique symbol }
>()("VerifyFailed", { profile: Schema.String, problems: Schema.Array(Schema.String) }) {}
