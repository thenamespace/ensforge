import { Array as Arr, Record as Rec, String as Str } from "effect";

/** Files every published package carries; npm adds them from the package folder only. */
const requiredFiles = ["package.json", "README.md", "LICENSE", "CHANGELOG.md"];

/** Paths that must never reach the registry: secrets, build caches, tests and dependencies. */
const forbidden = /(^|\/)(\.env[^/]*|[^/]*\.tsbuildinfo|node_modules|tests?|__tests__)(\/|$)/;

/**
 * Problems with the files of one installed tarball (paths relative to the package root, with
 * `/`): a required file is missing, a forbidden one is shipped, a source map names a source the
 * package does not contain (debuggers and go-to-definition would point nowhere), or a dependency
 * kept a pnpm-only `workspace:`/`catalog:` range that npm cannot install.
 */
export const contentProblems = (
  name: string,
  files: readonly string[],
  mapSources: ReadonlyMap<string, readonly string[]>,
  dependencies: Readonly<Record<string, string>>,
) => {
  const shipped = new Set(files);
  const problems = Arr.map(
    Arr.filter(requiredFiles, (file) => !shipped.has(file)),
    (file) => `${name}: ${file} is missing`,
  );
  for (const file of Arr.filter(files, (path) => forbidden.test(path)))
    problems.push(`${name}: ${file} must not be published`);
  for (const [map, sources] of mapSources) {
    for (const source of sources) {
      // `sources` entries are relative to the map's folder.
      const parts = Arr.dropRight(Str.split(map, "/"), 1);
      for (const part of Str.split(source, "/")) {
        if (part === "..") parts.pop();
        else if (part !== "." && part !== "") parts.push(part);
      }
      if (!shipped.has(Arr.join(parts, "/")))
        problems.push(`${name}: ${map} names ${source}, not shipped`);
    }
  }
  for (const [dependency, range] of Rec.toEntries(dependencies))
    if (Str.startsWith("workspace:")(range) || Str.startsWith("catalog:")(range))
      problems.push(`${name}: ${dependency}@${range} is not installable from npm`);
  return problems;
};
