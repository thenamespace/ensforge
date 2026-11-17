import { createHash } from "node:crypto";

import { Context, Effect, FileSystem, Layer, Path, type Scope } from "effect";

import type { Node, SourceFile } from "typescript/unstable/ast";
import { API, type Checker, type Program } from "typescript/unstable/sync";

import { SetupError, type ToolFailed } from "../errors.ts";
import { Tools } from "./Tools.ts";

/** A TypeScript 7 program over a set of files, through its `unstable/sync` API. */
export type Project = {
  readonly program: Program;
  readonly checker: Checker;
  readonly sourceFile: (file: string) => SourceFile;
  /** Prints a node, e.g. one built by `checker.signatureToSignatureDeclaration`. */
  readonly print: (node: Node) => string;
};

/** Options every project and `tsc` run starts from, as the packages build with. */
export const baseCompilerOptions = {
  module: "esnext",
  moduleResolution: "bundler",
  target: "es2022",
  strict: true,
  exactOptionalPropertyTypes: true,
  skipLibCheck: true,
  noEmit: true,
  jsx: "react-jsx",
} as const;

/**
 * TypeScript 7's compiler is a native process: scripts reach its parser and checker by opening a
 * project, and run `tsc` itself for builds and diagnostics.
 */
export class TypeScript extends Context.Service<
  TypeScript,
  {
    /** A program over `files`; closed with the scope. */
    readonly open: (
      files: readonly string[],
      compilerOptions?: Readonly<Record<string, unknown>>,
    ) => Effect.Effect<Project, SetupError, Scope.Scope>;
    /** Runs `tsc` with `args` from `cwd`. */
    readonly tsc: (
      args: readonly string[],
      options?: { readonly cwd?: string; readonly inherit?: boolean },
    ) => Effect.Effect<string, ToolFailed>;
    /** Writes a throwaway tsconfig under `<cwd>/node_modules/.cache` and returns its path. */
    readonly writeConfig: (
      cwd: string,
      config: Readonly<Record<string, unknown>>,
    ) => Effect.Effect<string, SetupError>;
  }
>()("@ensforge/tools/TypeScript") {
  static readonly layer = Layer.effect(
    TypeScript,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tools = yield* Tools;
      const tscBin = path.join(
        path.dirname(
          yield* Effect.sync(() => import.meta.resolve("typescript/package.json")).pipe(
            Effect.flatMap((url) => path.fromFileUrl(new URL(url))),
            Effect.orDie,
          ),
        ),
        "bin/tsc",
      );

      const writeConfig = Effect.fn("TypeScript.writeConfig")(
        function* (cwd: string, config: Readonly<Record<string, unknown>>) {
          const text = JSON.stringify(config);
          const folder = path.join(cwd, "node_modules/.cache/ensforge-dev");
          const file = path.join(
            folder,
            `tsconfig.${createHash("sha256").update(text).digest("hex").slice(0, 16)}.json`,
          );
          yield* fs.makeDirectory(folder, { recursive: true });
          yield* fs.writeFileString(file, text);
          return file;
        },
        Effect.mapError((cause) => new SetupError({ message: String(cause) })),
      );

      const open = Effect.fn("TypeScript.open")(function* (
        files: readonly string[],
        compilerOptions: Readonly<Record<string, unknown>> = {},
      ) {
        const cwd = process.cwd();
        const config = yield* writeConfig(cwd, {
          compilerOptions: { ...baseCompilerOptions, ...compilerOptions },
          files,
        });
        const api = yield* Effect.acquireRelease(
          Effect.sync(() => new API({ cwd })),
          (instance) => Effect.sync(() => instance.close()),
        );
        const project = api.updateSnapshot({ openProjects: [config] }).getProjects()[0];
        if (project === undefined)
          return yield* new SetupError({ message: `TypeScript could not open ${config}` });

        return {
          program: project.program,
          checker: project.checker,
          print: (node) => project.emitter.printNode(node),
          sourceFile: (file) => {
            const source = project.program.getSourceFile(file);
            if (source === undefined) throw new Error(`${file} is not in the program`);
            return source;
          },
        } satisfies Project;
      });

      const tsc = (
        args: readonly string[],
        options: { readonly cwd?: string; readonly inherit?: boolean } = {},
      ) => tools.run(process.execPath, [tscBin, ...args], options);

      return TypeScript.of({ open, tsc, writeConfig });
    }),
  );
}
