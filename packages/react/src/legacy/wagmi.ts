import { createWagmiConfig, type CreateWagmiConfigParameters } from "@ensforge/sdk/legacy/wagmi";

import { Ensforge } from "./ensforge.js";

export type { CreateWagmiConfigParameters } from "@ensforge/sdk/legacy/wagmi";

/** 0.x client from a wagmi config; replaced by the React rewrite (phase 015). */
export const createEnsforge = (parameters: CreateWagmiConfigParameters): Ensforge =>
  new Ensforge(createWagmiConfig(parameters));
