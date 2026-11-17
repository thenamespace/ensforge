// Minimal platform boundary keeps DOM ambient types out of Node SDK consumers.
interface Request<Result> {
  readonly result: Result;
  readonly error: Error | null;
  onsuccess: (() => void) | null;
  addEventListener(event: string, listener: () => void): void;
}

interface Cursor {
  readonly value: unknown;
  continue(): void;
}
interface Store {
  openCursor(range: unknown): Request<Cursor | null>;
  get(key: string): Request<unknown>;
  put(value: unknown, key: string): unknown;
}

interface Transaction {
  readonly error: Error | null;
  objectStore(name: string): Store;
  oncomplete: (() => void) | null;
  addEventListener(event: string, listener: () => void): void;
}

export interface WorkflowDatabase {
  createObjectStore(name: string): unknown;
  transaction(name: string, mode: "readwrite" | "readonly"): Transaction;
  onversionchange: (() => void) | null;
  close(): void;
}

export interface WorkflowIndexedDb {
  open(
    name: string,
    version: number,
  ): Request<WorkflowDatabase> & {
    onupgradeneeded: (() => void) | null;
    onblocked: (() => void) | null;
  };
}

export interface WorkflowKeyRange {
  bound(lower: string, upper: string, lowerOpen?: boolean): unknown;
}
