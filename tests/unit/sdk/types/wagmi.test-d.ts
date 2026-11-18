import { describe, expectTypeOf, it } from "@effect/vitest";

import { Ensforge as Root, ensActions, type EnsActions } from "@ensforge/sdk";
import { Ensforge } from "@ensforge/sdk/wagmi";
import type { Config } from "wagmi";

declare const config: Config;

describe("Ensforge from @ensforge/sdk/wagmi", () => {
  it("is the root Ensforge plus fromWagmi", () => {
    expectTypeOf(Ensforge.create).toEqualTypeOf(Root.create);
    expectTypeOf(Ensforge.fromWagmi(config).extend(ensActions())).toEqualTypeOf<
      Root.Client<EnsActions>
    >();
  });

  it("takes the create options without viem clients", () => {
    Ensforge.fromWagmi(config, { chainId: 1, switchChain: false, blockTag: "safe" });
    // @ts-expect-error the public client comes from wagmi
    Ensforge.fromWagmi(config, { publicClient: undefined });
  });
});
