import { WorkflowError } from "../errors/workflow-error.js";
import type {
  WorkflowKeyRange,
  WorkflowDatabase,
  WorkflowIndexedDb,
} from "../internal/workflows/indexed-db-types.js";
import type { WorkflowStorage, WorkflowStoredRecord } from "./storage.js";

/** Opens lazily so constructing config during SSR never accesses browser globals. */
export const createIndexedDbWorkflowStorage = (
  options: { readonly databaseName?: string } = {},
): WorkflowStorage & { close(): Promise<void> } => {
  let connection: Promise<WorkflowDatabase> | undefined;

  const open = () => {
    connection ??= new Promise<WorkflowDatabase>((resolve, reject) => {
      const factory = (globalThis as typeof globalThis & { indexedDB?: WorkflowIndexedDb })
        .indexedDB;
      if (!factory) {
        reject(
          new WorkflowError({
            code: "STORAGE_FAILED",
            message: "IndexedDB is unavailable in this environment",
          }),
        );
        return;
      }

      const request = factory.open(options.databaseName ?? "ensforge-workflows", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("records");
      };
      request.addEventListener("error", () => reject(request.error));
      request.onblocked = () =>
        reject(
          new WorkflowError({
            code: "STORAGE_FAILED",
            message: "Close older database connections before upgrading workflow storage",
          }),
        );
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
    }).catch((cause: unknown) => {
      connection = undefined;
      throw cause;
    });

    return connection;
  };

  const transact = async (
    namespace: string,
    id: string,
    record?: WorkflowStoredRecord,
    expectedRevision?: number,
  ): Promise<WorkflowStoredRecord | null | boolean> => {
    if (
      !namespace ||
      !id ||
      (record &&
        (record.id !== id ||
          record.revision !== (expectedRevision === undefined ? 0 : expectedRevision + 1)))
    )
      throw new WorkflowError({
        code: "INVALID_STATE",
        message: "Invalid workflow storage envelope",
      });

    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("records", record ? "readwrite" : "readonly");
      const store = transaction.objectStore("records");
      const key = JSON.stringify([namespace, id]);
      const request = store.get(key);
      let result: WorkflowStoredRecord | null | boolean = null;

      request.onsuccess = () => {
        const current = request.result as WorkflowStoredRecord | undefined;
        if (!record) {
          result = current ?? null;
          return;
        }

        const matches =
          expectedRevision === undefined
            ? current === undefined
            : current?.revision === expectedRevision;
        result = matches;
        if (matches) store.put(record, key);
      };
      transaction.oncomplete = () => resolve(result);
      transaction.addEventListener("error", () => reject(transaction.error));
      transaction.addEventListener("abort", () =>
        reject(
          transaction.error ??
            new WorkflowError({
              code: "STORAGE_FAILED",
              message: "Workflow storage transaction aborted",
            }),
        ),
      );
    });
  };

  return {
    kind: "workflow-storage",
    create: async ({ namespace, record }) =>
      (await transact(namespace, record.id, record)) as boolean,
    get: async ({ namespace, id }) =>
      (await transact(namespace, id)) as WorkflowStoredRecord | null,
    async list({ namespace, after, limit }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new WorkflowError({
          code: "INVALID_STATE",
          message: "Workflow page size must be between 1 and 100",
        });
      const database = await open();
      const keyRange = (globalThis as typeof globalThis & { IDBKeyRange?: WorkflowKeyRange })
        .IDBKeyRange;
      if (!keyRange)
        throw new WorkflowError({
          code: "STORAGE_FAILED",
          message: "IndexedDB key ranges are unavailable",
        });
      const prefix = `${JSON.stringify([namespace]).slice(0, -1)},`;
      return new Promise<ReadonlyArray<WorkflowStoredRecord>>((resolve, reject) => {
        const transaction = database.transaction("records", "readonly");
        const request = transaction
          .objectStore("records")
          .openCursor(
            keyRange.bound(
              after === undefined ? prefix : JSON.stringify([namespace, after]),
              `${prefix}\uffff`,
              after !== undefined,
            ),
          );
        const records: WorkflowStoredRecord[] = [];
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || records.length >= limit) return;
          records.push(cursor.value as WorkflowStoredRecord);
          if (records.length < limit) cursor.continue();
        };
        transaction.oncomplete = () => resolve(records);
        transaction.addEventListener("error", () => reject(transaction.error));
        transaction.addEventListener("abort", () => reject(transaction.error));
      });
    },
    compareAndSwap: async ({ namespace, id, expectedRevision, record }) =>
      (await transact(namespace, id, record, expectedRevision)) as boolean,
    async close() {
      const pending = connection;
      connection = undefined;
      if (pending) (await pending).close();
    },
  };
};
