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
      // The 0.x suites define helpers inside tests. Revisit when the test system is rewritten.
      files: ["**/test/**"],
      rules: { "unicorn/consistent-function-scoping": "off" },
    },
  ],
});
