import { WorkflowError } from "../../errors/workflow-error.js";
import type { WorkflowStorage } from "../../workflows/storage.js";
import {
  loadWorkflowRecord,
  storeWorkflowRecord,
  workflowNamespace,
  workflowIndexNamespace,
  type WorkflowRecord,
} from "./record.js";
import { createWorkflowSession } from "./session.js";

export const acquireWorkflow = async (
  storage: WorkflowStorage,
  input: {
    id?: string;
    fingerprint: string;
    operation: string;
    chainId: number;
    account: string;
    resume?: unknown;
  },
) => {
  let id = input.id;
  let record: WorkflowRecord | null = null;

  if (id) {
    record = await loadWorkflowRecord(storage, id);
    if (!record)
      throw new WorkflowError({
        code: "NOT_FOUND",
        message: "Explicit workflow ID was not found",
        workflowId: id,
      });
  } else {
    const index = await storage.get({ namespace: workflowIndexNamespace, id: input.fingerprint });
    if (index) record = await loadWorkflowRecord(storage, index.value);
    if (index && !record)
      throw new WorkflowError({
        code: "INVALID_STATE",
        message: "Workflow index points to a missing record",
      });

    if (!record || record.status === "completed") {
      id = crypto.randomUUID();
      record = {
        version: 1,
        id,
        revision: 0,
        fingerprint: input.fingerprint,
        operation: input.operation,
        chainId: input.chainId,
        account: input.account,
        status: "pending",
        owner: null,
        leaseUntil: 0,
        progress: null,
        children: {},
        plans: {},
        submissions: {},
      };
      if (
        !(await storage.create({
          namespace: workflowNamespace,
          record: storeWorkflowRecord(record),
        }))
      )
        throw new WorkflowError({ code: "CONFLICT", message: "Workflow ID collision; retry" });

      const pointer = {
        id: input.fingerprint,
        revision: index ? index.revision + 1 : 0,
        value: id,
      };
      const selected = index
        ? await storage.compareAndSwap({
            namespace: workflowIndexNamespace,
            id: input.fingerprint,
            expectedRevision: index.revision,
            record: pointer,
          })
        : await storage.create({ namespace: workflowIndexNamespace, record: pointer });
      if (!selected)
        throw new WorkflowError({
          code: "CONFLICT",
          message: "Another caller started this workflow; retry to load it",
        });
    }
  }

  if (
    !record ||
    record.fingerprint !== input.fingerprint ||
    record.chainId !== input.chainId ||
    record.account !== input.account
  )
    throw new WorkflowError({
      code: "IDENTITY_MISMATCH",
      message: "Workflow inputs, account, or deployment do not match",
      ...(id ? { workflowId: id } : {}),
    });

  if (record.owner && record.leaseUntil > Date.now())
    throw new WorkflowError({
      code: "BUSY",
      message: "Another caller is advancing this workflow",
      workflowId: record.id,
    });

  const token = crypto.randomUUID();
  const claimed = {
    ...record,
    revision: record.revision + 1,
    owner: token,
    leaseUntil: Date.now() + 120_000,
  };
  if (
    !(await storage.compareAndSwap({
      namespace: workflowNamespace,
      id: record.id,
      expectedRevision: record.revision,
      record: storeWorkflowRecord(claimed),
    }))
  )
    throw new WorkflowError({
      code: "CONFLICT",
      message: "Workflow changed while acquiring it",
      workflowId: record.id,
    });

  return createWorkflowSession(storage, claimed, token);
};
