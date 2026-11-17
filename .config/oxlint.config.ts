import config from "klarity/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [config],
  rules: {
    // `_tag` is Effect's discriminant for tagged errors and services.
    "no-underscore-dangle": ["error", { allow: ["_tag"] }],
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
  ],
});
