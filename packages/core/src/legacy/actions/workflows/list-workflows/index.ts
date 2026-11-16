import { Effect, Schema } from "effect";

import { defineAction } from "../../../action/action.js";
import { WorkflowError } from "../../../errors/workflow-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { decodeWorkflowValue } from "../../../internal/workflows/codec.js";
import {
  WorkflowRecord,
  workflowNamespace,
  workflowIndexNamespace,
} from "../../../internal/workflows/record.js";
import type { WalletOverrides, WriteError } from "../../../write/types.js";

export const listWorkflows = defineAction<
  WalletOverrides & {
    readonly after?: string;
    readonly limit?: number;
    readonly status?: "pending" | "completed";
  },
  {
    readonly workflows: ReadonlyArray<{
      readonly workflowId: string;
      readonly operation: string;
      readonly status: "pending" | "completed";
    }>;
    readonly nextCursor: string | null;
  },
  WriteError
>(
  Effect.fn("ensforge.listWorkflows")(function* (config, parameters) {
    const storage = config.storage;
    const limit = parameters.limit ?? 25;
    const list = storage?.list?.bind(storage);
    if (!storage || !list)
      return yield* new WorkflowError({
        code: "INVALID_STATE",
        message: "This storage adapter does not support workflow enumeration",
      });
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      return yield* new WorkflowError({
        code: "INVALID_STATE",
        message: "Workflow page size must be between 1 and 100",
      });
    const { account } = yield* provideConfig(config, resolveWalletContext(parameters));
    const address = (typeof account === "string" ? account : account.address).toLowerCase();
    return yield* Effect.tryPromise({
      try: async () => {
        const records = await list({
          namespace: workflowNamespace,
          limit,
          ...(parameters.after === undefined ? {} : { after: parameters.after }),
        });
        const candidates = records
          .map((saved) => {
            const record = Schema.decodeUnknownSync(WorkflowRecord)(
              decodeWorkflowValue(saved.value),
            );
            if (record.id !== saved.id || record.revision !== saved.revision)
              throw new WorkflowError({
                code: "INVALID_STATE",
                message: "Workflow envelope and payload disagree",
              });
            return record;
          })
          .filter(
            (record) =>
              record.chainId === config.chainId &&
              record.account === address &&
              (parameters.status === undefined || record.status === parameters.status),
          );
        const selected = await Promise.all(
          candidates.map(async (record) => {
            // An index race can leave an unselected record; it never represents a started workflow.
            if (record.status === "pending") {
              const pointer = await storage.get({
                namespace: workflowIndexNamespace,
                id: record.fingerprint,
              });
              if (pointer?.value !== record.id) return null;
            }
            return { workflowId: record.id, operation: record.operation, status: record.status };
          }),
        );
        const workflows = selected.filter((record) => record !== null);
        return {
          workflows,
          nextCursor: records.length === limit ? (records.at(-1)?.id ?? null) : null,
        };
      },
      catch: (cause) =>
        cause instanceof WorkflowError
          ? cause
          : new WorkflowError({
              code: "STORAGE_FAILED",
              message: "Unable to list workflows",
              cause,
            }),
    });
  }),
);
