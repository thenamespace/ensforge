import { Effect } from "effect";

import type { EnsforgeConfig } from "../../config/config.js";
import { WalletError } from "../../errors/wallet-error.js";
import type {
  ConfirmationPolicy,
  NativeBatchResult,
  SendCallsParameters,
  WalletCapabilitiesResult,
  WriteError,
} from "../../write/types.js";
import { provideConfig } from "../config/context.js";
import { resolveWalletContext } from "../services/wallet-client.js";
import { journalKey } from "../workflows/journal.js";
import { ActiveWorkflow, WorkflowStep } from "../workflows/session.js";
import { confirmNativeBatch } from "./confirm-native-batch.js";
import { prepareWriteIntents } from "./prepare-write-intents.js";
import { simulatePreparedCalls } from "./simulate-prepared-calls.js";
import { WriteClient } from "./write-client.js";

export const executeNativeBatch = Effect.fn("executeNativeBatch")(function* (
  config: EnsforgeConfig,
  parameters: SendCallsParameters,
  capabilities: WalletCapabilitiesResult,
): Effect.fn.Return<NativeBatchResult, WriteError> {
  if (!capabilities.nativeCalls) {
    return yield* new WalletError({
      code: "BATCH_UNSUPPORTED",
      message: `The wallet does not advertise native calls on chain ${config.chainId}`,
      cause: capabilities.raw,
    });
  }

  const atomicity = parameters.atomicity ?? "preferred";

  if (
    atomicity === "required" &&
    capabilities.atomicity !== "supported" &&
    capabilities.atomicity !== "ready"
  ) {
    return yield* new WalletError({
      code: "ATOMICITY_UNAVAILABLE",
      message: `The wallet cannot guarantee atomic calls on chain ${config.chainId}`,
      cause: capabilities.raw,
    });
  }

  const calls = yield* prepareWriteIntents(config, parameters);

  const workflow = yield* ActiveWorkflow;
  const step = yield* WorkflowStep;
  const submitted = workflow?.record.submissions[journalKey("batch", calls, step).key]?.reference;

  if (!submitted && (parameters.simulation ?? config.writes.simulation) === "required") {
    yield* provideConfig(config, simulatePreparedCalls(calls, config.reads.concurrency));
  }

  const { walletClient, account } = yield* provideConfig(config, resolveWalletContext(parameters));
  const client = yield* provideConfig(config, WriteClient);

  const forceAtomic =
    atomicity === "required" ||
    (atomicity === "preferred" && capabilities.atomicity === "supported");

  const sendOptions =
    parameters.capabilities === undefined
      ? { forceAtomic }
      : { forceAtomic, capabilities: parameters.capabilities };

  const submission = yield* client.sendCalls(walletClient, account, calls, sendOptions);
  const confirmation: ConfirmationPolicy = parameters.confirmation ?? config.writes.confirmation;

  return yield* confirmNativeBatch(
    config,
    walletClient,
    submission.id,
    calls,
    capabilities,
    confirmation,
    forceAtomic,
  ).pipe(Effect.provideService(WriteClient, client));
});
