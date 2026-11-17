import type { Config as WagmiConfig } from "wagmi";

import type { SharedCreateConfigParameters } from "../config/config.js";

export interface CreateWagmiConfigParameters extends SharedCreateConfigParameters {
  readonly wagmiConfig: WagmiConfig;
}
