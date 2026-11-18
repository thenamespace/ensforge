import type { Member } from "./members.ts";
import type { DocSections } from "./sections.ts";

/** Where a declaration starts: a repository path and its 1-based line. */
export type SourceLocation = { readonly file: string; readonly line: number };

/** A value an action resolves to: its documented type and the members one level down. */
export type Returns = {
  readonly type: string;
  readonly description: string;
  readonly members: readonly Member[];
};

/** Everything an action page shows, read from one action folder. */
export type ActionDoc = {
  /** Docs root of the package: `sdk` or `hca`. */
  readonly root: string;
  readonly domain: string;
  readonly folder: string;
  readonly name: string;
  readonly doc: DocSections;
  /** The function's declaration as written, without its body. */
  readonly signature: string;
  readonly source: SourceLocation;
  /** `write`: has plan methods; `send`: signs or sends without them; `read` otherwise. */
  readonly kind: "read" | "write" | "send";
  readonly batchable: boolean;
  readonly options: {
    readonly variants: readonly (readonly Member[])[];
    /** Shared option groups the action also takes (`Read`, `Write`). */
    readonly shared: readonly string[];
  };
  readonly returns: Returns;
  /** `.prepare`, `.simulate`, `.estimateGas` with their one-line docs. */
  readonly planMethods: readonly { readonly name: string; readonly description: string }[];
  readonly sync:
    | { readonly name: string; readonly doc: DocSections; readonly returns: Returns }
    | undefined;
};

/** A documented export of an entry point (a function, constant, type or class). */
export type ExportDoc = {
  /** Path from the entry, e.g. `Name.normalize`. */
  readonly path: string;
  readonly kind: "function" | "const" | "type" | "interface" | "class";
  readonly stability: string;
  readonly doc: DocSections;
  /** Declaration as written: a signature or the type. */
  readonly signature: string;
  readonly members: readonly Member[];
  readonly source: SourceLocation;
};

/** One error code with its developer and end-user copy. */
export type ErrorCodeDoc = {
  readonly code: string;
  readonly errorClass: string;
  /** Docs root of the package that throws it. */
  readonly root: string;
  readonly shortMessage: string;
  readonly hint: string | undefined;
  readonly retryable: boolean;
  readonly user:
    | { readonly title: string; readonly message: string; readonly action?: string | undefined }
    | undefined;
};

/** One error class: its summary, the fields it adds and its codes. */
export type ErrorClassDoc = {
  readonly name: string;
  readonly root: string;
  readonly summary: string;
  readonly source: SourceLocation;
  readonly fields: readonly Member[];
  readonly codes: readonly ErrorCodeDoc[];
};

/** A page that names a code in `@throws`. */
export type Thrower = { readonly path: string; readonly url: string; readonly when: string };
