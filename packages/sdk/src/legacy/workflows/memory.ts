import { WorkflowError } from "../errors/workflow-error.js";
import type { WorkflowStorage, WorkflowStoredRecord } from "./storage.js";

/** Atomic in one process; state is lost when this adapter instance is discarded. */
export const createMemoryWorkflowStorage = (): WorkflowStorage => {
  const records = new Map<string, WorkflowStoredRecord>();

  return {
    kind: "workflow-storage",
    async create({ namespace, record }) {
      if (!namespace || !record.id || record.revision !== 0)
        throw new WorkflowError({
          code: "INVALID_STATE",
          message: "New records require a namespace, ID, and revision zero",
        });

      const key = JSON.stringify([namespace, record.id]);
      if (records.has(key)) return false;

      records.set(key, { ...record });
      return true;
    },
    async get({ namespace, id }) {
      const record = records.get(JSON.stringify([namespace, id]));
      return record ? { ...record } : null;
    },
    async list({ namespace, after, limit }) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new WorkflowError({
          code: "INVALID_STATE",
          message: "Workflow page size must be between 1 and 100",
        });
      // Sort a fresh array; the public package targets ES2022.
      return (
        [...records.entries()]
          .filter(
            ([key, record]) =>
              JSON.parse(key)[0] === namespace && (after === undefined || record.id > after),
          )
          .map(([, record]) => ({ id: record.id, revision: record.revision, value: record.value }))
          // oxlint-disable-next-line unicorn/no-array-sort
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .slice(0, limit)
      );
    },
    async compareAndSwap({ namespace, id, expectedRevision, record }) {
      if (
        record.id !== id ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 ||
        record.revision !== expectedRevision + 1
      )
        throw new WorkflowError({
          code: "INVALID_STATE",
          message: "Updates must preserve ID and increment revision once",
        });

      const key = JSON.stringify([namespace, id]);
      if (records.get(key)?.revision !== expectedRevision) return false;

      records.set(key, { ...record });
      return true;
    },
  };
};
