import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { defineConfig } from "fumadocs-mdx/config";
import { transformerTwoslash } from "fumadocs-twoslash";
import { createFileSystemTypesCache } from "fumadocs-twoslash/cache-fs";

import { ensforgeDark, ensforgeLight } from "./src/themes/code";

export default defineConfig({
  mdxOptions: {
    // One package manager choice for every install block on the site.
    remarkNpmOptions: { persist: { id: "package-manager" } },
    rehypeCodeOptions: {
      themes: {
        light: ensforgeLight,
        dark: ensforgeDark,
      },
      langs: ["ts", "tsx", "js", "jsx"],
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        // Opt in per block with ```ts twoslash. Types resolve against the workspace packages'
        // built declarations (turbo builds them first), and are cached so rebuilds skip
        // unchanged blocks.
        transformerTwoslash({
          typesCache: createFileSystemTypesCache({ dir: "node_modules/.cache/twoslash" }),
        }),
      ],
    },
  },
});
