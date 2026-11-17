import type { Node, SourceFile } from "typescript/unstable/ast";
import type { Checker, Program } from "typescript/unstable/sync";

export type Project = {
  readonly program: Program;
  readonly checker: Checker;
  readonly print: (node: Node) => string;
  readonly sourceFile: (file: string) => SourceFile;
  readonly close: () => void;
};

export declare const openProject: (
  cwd: string,
  files: readonly string[],
  compilerOptions?: Record<string, unknown>,
) => Project;

export declare const runTsc: (
  args: readonly string[],
  options?: { readonly cwd?: string; readonly stdio?: "pipe" | "inherit" },
) => { readonly status: number; readonly output: string };
