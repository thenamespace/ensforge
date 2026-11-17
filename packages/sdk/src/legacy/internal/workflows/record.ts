import { Schema } from "effect";

import { WorkflowError } from "../../errors/workflow-error.js";
import type { WorkflowStorage } from "../../workflows/storage.js";
import { decodeWorkflowValue, encodeWorkflowValue } from "./codec.js";

export const workflowIndexNamespace = "ensforge/workflow-index/v1";
export const workflowNamespace = "ensforge/workflows/v1";
export const WorkflowRecord = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.NonEmptyString,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  fingerprint: Schema.NonEmptyString,
  operation: Schema.NonEmptyString,
  chainId: Schema.Int,
  account: Schema.NonEmptyString,
  status: Schema.Literals(["pending", "completed"]),
  owner: Schema.NullOr(Schema.String),
  leaseUntil: Schema.Number,
  progress: Schema.Unknown,
  children: Schema.Record(Schema.String, Schema.Unknown),
  plans: Schema.Record(Schema.String, Schema.Unknown),
  submissions: Schema.Record(
    Schema.String,
    Schema.Struct({
      kind: Schema.Literals(["transaction", "batch"]),
      slot: Schema.String,
      step: Schema.String,
      reference: Schema.NullOr(Schema.String),
      calls: Schema.Array(
        Schema.Struct({
          to: Schema.String,
          data: Schema.String,
          value: Schema.BigInt,
          from: Schema.String,
        }),
      ),
    }),
  ),
});
export type WorkflowRecord = typeof WorkflowRecord.Type;

export const loadWorkflowRecord = async (storage: WorkflowStorage, id: string) => {
  const saved = await storage.get({ namespace: workflowNamespace, id });
  if (!saved) return null;

  const record = Schema.decodeUnknownSync(WorkflowRecord)(decodeWorkflowValue(saved.value));
  if (record.id !== id || record.revision !== saved.revision)
    throw new WorkflowError({
      code: "INVALID_STATE",
      message: "Workflow envelope and payload disagree",
      workflowId: id,
    });

  return record;
};

export const storeWorkflowRecord = (record: WorkflowRecord) => ({
  id: record.id,
  revision: record.revision,
  value: encodeWorkflowValue(record),
});
