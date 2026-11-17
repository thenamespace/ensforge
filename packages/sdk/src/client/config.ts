import { memoryStorage } from "../plan/storage.js";
import type { Config, CreateOptions } from "./types.js";

// Calldata bytes per multicall chunk; large enough for typical pages, small enough for RPC limits.
const defaultBatchSize = 16_384;

const resolveBatch = (batch: CreateOptions["batch"]): Config["batch"] => {
  const multicall = batch?.multicall ?? true;

  if (multicall === false) return { multicall: false };
  if (multicall === true) return { multicall: { batchSize: defaultBatchSize, wait: 0 } };
  return {
    multicall: { batchSize: multicall.batchSize ?? defaultBatchSize, wait: multicall.wait ?? 0 },
  };
};

/** Fills every `Config` default from the create options. */
export const resolveConfig = (options: CreateOptions): Config =>
  Object.freeze({
    ccipRead:
      options.ccipRead === false
        ? false
        : Object.freeze({ gatewayUrls: options.ccipRead?.gatewayUrls ?? [] }),
    batch: resolveBatch(options.batch),
    blockTag: options.blockTag ?? "latest",
    storage: options.storage ?? memoryStorage(),
    simulate: options.simulate ?? true,
    indexer: options.indexer,
  });
