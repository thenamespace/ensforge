import { memoryStorage } from "../plan/storage.js";
import type { Config, CreateOptions } from "./types.js";

/** Fills every `Config` default from the create options. */
export const resolveConfig = (options: CreateOptions): Config => {
  const multicall = options.batch?.multicall ?? true;
  const custom = typeof multicall === "object" ? multicall : {};

  return Object.freeze({
    ccipRead:
      options.ccipRead === false
        ? false
        : Object.freeze({ gatewayUrls: options.ccipRead?.gatewayUrls ?? [] }),
    batch:
      multicall === false
        ? { multicall: false as const }
        : {
            multicall: {
              // Calldata bytes per multicall chunk: large enough for typical pages, small enough
              // for RPC limits.
              batchSize: custom.batchSize ?? 16_384,
              wait: custom.wait ?? 0,
            },
          },
    blockTag: options.blockTag ?? "latest",
    storage: options.storage ?? memoryStorage(),
    simulate: options.simulate ?? true,
    indexer: options.indexer,
  });
};
