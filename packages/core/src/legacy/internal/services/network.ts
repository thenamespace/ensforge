import { Context } from "effect";

import type { EnsRuntimeChainId, EnsRuntimeNetwork } from "../../config/config.js";

export class EnsNetworkService extends Context.Service<
  EnsNetworkService,
  {
    readonly network: EnsRuntimeNetwork;
    readonly chainId: EnsRuntimeChainId;
  }
>()("@ensforge/core/EnsNetworkService") {}
