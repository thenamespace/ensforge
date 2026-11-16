import { Effect } from "effect";

import type { EnsforgeConfig } from "../../config/config.js";
import { WorkflowError } from "../../errors/workflow-error.js";
import type { WalletOverrides } from "../../write/types.js";
import { provideConfig } from "../config/context.js";
import { resolveWalletContext } from "../services/wallet-client.js";
import { loadWorkflowRecord } from "./record.js";

export const inspectWorkflow = Effect.fn("inspectWorkflow")(function* (
  config: EnsforgeConfig,
  parameters: WalletOverrides & { readonly workflowId: string },
) {
  const storage = config.storage;
  if (!storage)
    return yield* new WorkflowError({
      code: "NOT_FOUND",
      message: "Workflow storage is not configured",
    });

  const { account } = yield* provideConfig(config, resolveWalletContext(parameters));
  const address = (typeof account === "string" ? account : account.address).toLowerCase();
  const record = yield* Effect.tryPromise({
    try: () => loadWorkflowRecord(storage, parameters.workflowId),
    catch: (cause) =>
      cause instanceof WorkflowError
        ? cause
        : new WorkflowError({ code: "STORAGE_FAILED", message: "Unable to read workflow", cause }),
  });
  if (!record)
    return yield* new WorkflowError({
      code: "NOT_FOUND",
      message: "Workflow was not found",
      workflowId: parameters.workflowId,
    });
  if (record.chainId !== config.chainId || record.account !== address)
    return yield* new WorkflowError({
      code: "IDENTITY_MISMATCH",
      message: "Workflow belongs to a different account or chain",
      workflowId: record.id,
    });

  return { storage, record };
});
