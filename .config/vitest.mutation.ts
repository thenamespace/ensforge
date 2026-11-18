import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Aliases that resolve `packages` (folder names under `packages/`) to the sources next to this
 * file. Stryker runs in a sandbox copy of the repository that links the original `node_modules`,
 * whose workspace links lead back to the original, unmutated sources.
 */
export const sandboxSources = (packages: readonly string[]) =>
  packages.flatMap((folder) => {
    const root = fileURLToPath(new URL(`../packages/${folder}/`, import.meta.url));
    const manifest = JSON.parse(readFileSync(`${root}package.json`, "utf8")) as {
      readonly name: string;
      readonly exports: Record<string, string | { readonly "workspace-source"?: string }>;
    };

    return Object.entries(manifest.exports).flatMap(([subpath, target]) => {
      const source = typeof target === "string" ? undefined : target["workspace-source"];
      if (source === undefined) return [];

      const specifier = `${manifest.name}${subpath.slice(1)}`.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      return [
        {
          find: new RegExp(`^${specifier.replace("*", "(.+)")}$`),
          replacement: `${root}${source.slice(2).replace("*", "$1")}`,
        },
      ];
    });
  });
