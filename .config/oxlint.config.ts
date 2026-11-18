import { presets } from "@effect/tsgo/oxlint-presets";
import { Record } from "effect";

import config from "klarity/oxlint";
import { defineConfig } from "oxlint";

// The Effect presets (and `typeAware`) need the oxlint and tsgolint binaries patched by
// `effect-tsgo patch --oxlint`, which `pnpm install` runs through `prepare`.
export default defineConfig({
  extends: [
    config,
    presets.correctness,
    presets.antipattern,
    presets.effectNative,
    presets.style,
    presets.maintainers,
  ],
  rules: {
    // `_tag` is Effect's discriminant for tagged errors and services.
    "no-underscore-dangle": ["error", { allow: ["_tag"] }],
    // Public actions take the client first (`Actions.record.get(ens, options)`, AGENTS.md):
    // that keeps them tree-shakeable and shared by the Promise and Effect APIs.
    "effecttsgo/missing-pipeable-signature": "off",
  },
  overrides: [
    {
      // Tests run through @effect/vitest only (it re-exports vitest's API).
      files: ["**/test/**", "**/tests/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          { paths: [{ name: "vitest", message: "Import from @effect/vitest instead." }] },
        ],
      },
    },
    {
      // Only the published entries are public API: internal modules, the verify fixtures (which
      // play a consumer) and the private test and tool packages have no stability to leak.
      files: ["**/src/internal/**", "**/packages/*/verify/**", "**/tests/**", "**/tools/**"],
      rules: { "effecttsgo/api-stability-leak": "off" },
    },
    {
      // @ensforge/contracts is runtime-neutral and does not depend on Effect, so the rules that
      // suggest Effect replacements for native APIs do not apply.
      files: ["**/packages/contracts/**"],
      rules: Record.map(presets.effectNative.rules, () => "off" as const),
    },
    {
      // Consumer fixtures play a user: they call the Promise API and the documented unstable and
      // experimental APIs on purpose.
      files: ["**/packages/*/verify/**"],
      rules: {
        "effecttsgo/async-function": "off",
        "effecttsgo/experimental-api-usage": "off",
        "effecttsgo/unstable-api-usage": "off",
      },
    },
  ],
});
