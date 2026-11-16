import { Context } from "effect";

import { WorkflowError } from "../../errors/workflow-error.js";
import type { WorkflowStorage } from "../../workflows/storage.js";
import {
  loadWorkflowRecord,
  storeWorkflowRecord,
  workflowNamespace,
  type WorkflowRecord,
} from "./record.js";

export const createWorkflowSession = (
  storage: WorkflowStorage,
  initial: WorkflowRecord,
  token: string,
) => {
  let current = initial;
  let queue = Promise.resolve();

  return {
    get record() {
      return current;
    },
    async release(): Promise<void> {
      await queue;
      const saved = await loadWorkflowRecord(storage, current.id);
      // A stale worker must never release another worker's lease.
      if (!saved || saved.owner !== token) return;
      await storage.compareAndSwap({
        namespace: workflowNamespace,
        id: saved.id,
        expectedRevision: saved.revision,
        record: storeWorkflowRecord({
          ...saved,
          revision: saved.revision + 1,
          owner: null,
          leaseUntil: 0,
        }),
      });
    },
    update(change: (record: WorkflowRecord) => WorkflowRecord): Promise<void> {
      const next = queue.then(async () => {
        const record = { ...change(current), revision: current.revision + 1 };
        if (
          current.owner !== token ||
          !(await storage.compareAndSwap({
            namespace: workflowNamespace,
            id: current.id,
            expectedRevision: current.revision,
            record: storeWorkflowRecord(record),
          }))
        )
          throw new WorkflowError({
            code: "CONFLICT",
            message: "Workflow changed concurrently; reload its saved state",
            workflowId: current.id,
          });
        current = record;
        return undefined;
      });
      // The caller receives next; keep later cleanup runnable after a reported failure.
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
};
export type WorkflowSession = ReturnType<typeof createWorkflowSession>;

export const ActiveWorkflow = Context.Reference<WorkflowSession | undefined>(
  "@ensforge/core/workflows/ActiveWorkflow",
  { defaultValue: () => undefined },
);

export const WorkflowStep = Context.Reference<string>("@ensforge/core/workflows/WorkflowStep", {
  defaultValue: () => "root",
});
