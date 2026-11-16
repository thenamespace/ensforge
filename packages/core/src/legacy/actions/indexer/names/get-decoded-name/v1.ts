import { Effect } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetLabelDocument,
  type V1GetLabelQuery,
  type V1GetLabelQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-label.js";
import { requireIndexerData } from "../../../../internal/indexer/response.js";
import type { Labelhash } from "../../../../schemas/hash.js";
import type { GetDecodedNameError } from "./types.js";

const operationName = "V1GetLabel";

export const getV1Label = Effect.fn("getV1Label")(function* (
  config: EnsforgeConfig,
  hash: Labelhash,
): Effect.fn.Return<string | null, GetDecodedNameError> {
  const response = yield* requestIndexer<V1GetLabelQuery, V1GetLabelQueryVariables>(config, {
    protocol: "v1",
    operationName,
    document: V1GetLabelDocument,
    variables: { labelhash: hash },
  });

  const data = yield* requireIndexerData(config, "v1", operationName, response);

  return data.domains[0]?.labelName ?? null;
});
