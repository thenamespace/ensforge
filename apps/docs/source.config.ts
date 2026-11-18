import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig } from "fumadocs-mdx/config";

import { ensforgeDark, ensforgeLight } from "./src/themes/code";

export default defineConfig({
  mdxOptions: {
    // One package manager choice for every install block on the site.
    remarkNpmOptions: { persist: { id: "package-manager" } },
    // ```mermaid blocks render as diagrams (<Mermaid chart="..." />).
    remarkPlugins: [remarkMdxMermaid],
    rehypeCodeOptions: {
      themes: {
        light: ensforgeLight,
        dark: ensforgeDark,
      },
      langs: [
        "ts",
        "tsx",
        "js",
        "jsx",
        "json",
        "jsonc",
        "sh",
        "bash",
        "text",
        "diff",
        "mdx",
        "yaml",
      ],
    },
  },
});
