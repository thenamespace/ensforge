import { Effect } from "effect";

import { type Address } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { getHca } from "../get-hca/index.js";
import type { HcaErrorResult, HcaReadParameters } from "../types.js";

export const getHcaOwner = defineReadAction<HcaReadParameters, Address | null, HcaErrorResult>(
  (config, parameters) =>
    getHca
      .effect(config, parameters)
      .pipe(Effect.map((state) => (state.status === "deployed" ? state.owner : null))),
);
