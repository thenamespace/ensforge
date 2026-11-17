// TypeScript 7's compiler runs as a native process; scripts reach its parser and checker through
// the `unstable/sync` API, which works on projects. This opens one for a set of files.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { API } from "typescript/unstable/sync";

/**
 * A program over `files` (absolute paths). `compilerOptions` default to strict ES2022 modules with
 * bundler resolution, as the packages build with. Call `close()` when done.
 */
export const openProject = (cwd, files, compilerOptions = {}) => {
  const options = {
    module: "esnext",
    moduleResolution: "bundler",
    target: "es2022",
    strict: true,
    exactOptionalPropertyTypes: true,
    skipLibCheck: true,
    noEmit: true,
    jsx: "react-jsx",
    ...compilerOptions,
  };
  const config = { compilerOptions: options, files: [...files] };
  const folder = join(cwd, "node_modules/.cache/typescript-api");
  const name = createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
  const path = join(folder, `tsconfig.${name}.json`);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path, JSON.stringify(config));

  const api = new API({ cwd });
  const project = api.updateSnapshot({ openProjects: [path] }).getProjects()[0];
  if (project === undefined) throw new Error(`TypeScript could not open ${path}`);

  return {
    program: project.program,
    checker: project.checker,
    /** Prints a node, e.g. one built by `checker.signatureToSignatureDeclaration`. */
    print: (node) => project.emitter.printNode(node),
    sourceFile: (file) => {
      const source = project.program.getSourceFile(file);
      if (source === undefined) throw new Error(`${file} is not in the program`);
      return source;
    },
    close: () => api.close(),
  };
};

const tscBin = join(
  dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin/tsc",
);

/** Runs the `tsc` CLI with `args`, returning its exit status and output. */
export const runTsc = (args, { cwd = process.cwd(), stdio = "pipe" } = {}) => {
  const result = spawnSync(process.execPath, [tscBin, ...args], { cwd, stdio, encoding: "utf8" });
  return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
};
