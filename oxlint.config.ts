import config from "klarity/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [config],
  overrides: [
    {
      // The 0.x suites define helpers inside tests. Revisit when the test system is rewritten.
      files: ["**/test/**"],
      rules: { "unicorn/consistent-function-scoping": "off" },
    },
  ],
});
