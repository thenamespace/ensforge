import type { PackedRelease } from "./packDir.ts";

/**
 * The manifests of a throwaway app that installs the packed tarballs: each release as a `file:`
 * dependency, overridden everywhere so the packages' dependencies on each other resolve to the
 * tarballs too (the new versions are not on npm yet), and every peer the packages declare,
 * optional ones included, so each entry can be imported. JSON is valid YAML, so the pnpm
 * workspace file needs no YAML writer.
 */
export const consumerManifests = (
  releases: readonly PackedRelease[],
  tarballOf: (release: PackedRelease) => string,
  peers: Readonly<Record<string, string>>,
) => {
  const tarballs = Object.fromEntries(
    releases.map((release) => [release.name, `file:${tarballOf(release)}`]),
  );
  const dependencies: Record<string, string> = Object.fromEntries(
    Object.entries(peers).filter(([name]) => !(name in tarballs)),
  );
  // React's types ship separately; the react package's declarations need them.
  if (peers.react !== undefined) dependencies["@types/react"] = peers.react;
  return {
    packageJson: {
      name: "ensforge-release-consumer",
      private: true,
      type: "module",
      dependencies: { ...dependencies, ...tarballs },
    },
    workspace: { overrides: tarballs },
  };
};

/** Import specifiers of a package's published exports, without `./package.json` and patterns. */
export const publicEntries = (name: string, exports: Readonly<Record<string, unknown>>) =>
  Object.keys(exports)
    .filter((subpath) => subpath !== "./package.json" && !subpath.includes("*"))
    .map((subpath) => (subpath === "." ? name : `${name}/${subpath.slice(2)}`));

/**
 * A module importing every entry: run by Node as `.mjs`, compiled by tsc as `.ts`. An entry that
 * exports nothing is reported by the `.mjs` run.
 */
export const entriesModule = (specifiers: readonly string[]) =>
  [
    ...specifiers.map((specifier, index) => `import * as entry${index} from "${specifier}";`),
    "",
    `const entries = { ${specifiers.map((specifier, index) => `"${specifier}": entry${index}`).join(", ")} };`,
    "const empty = Object.entries(entries).filter(([, entry]) => Object.keys(entry).length === 0);",
    'if (empty.length > 0) throw new Error("no exports: " + empty.map(([name]) => name).join(", "));',
    "",
  ].join("\n");
