import { Context } from "effect";

import type { PublicClient } from "viem";

export class PublicClientService extends Context.Service<
  PublicClientService,
  {
    readonly client: PublicClient;
  }
>()("@ensforge/core/PublicClientService") {}
