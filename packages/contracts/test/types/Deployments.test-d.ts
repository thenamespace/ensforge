import { describe, expectTypeOf, it } from "@effect/vitest";

import { Deployments } from "#/index";

describe("Deployments.define types", () => {
  it("keeps the profile's literal types", () => {
    const devnet = Deployments.define({
      name: "devnet",
      chainId: 31337,
      v2: Deployments.sepolia.v2,
    });
    expectTypeOf(devnet.chainId).toEqualTypeOf<31337>();
    expectTypeOf(
      devnet.v2.hca.entryPoint,
    ).toEqualTypeOf<"0x0000000071727De22E5E9d8BAf0edAc6f37da032">();
  });

  it("rejects unknown capability values at compile time", () => {
    const capabilities = {
      ...Deployments.sepolia.v2.capabilities,
      hcaSessionDomain: "rhinestone",
    } as const;
    const v2 = { ...Deployments.sepolia.v2, capabilities };
    // @ts-expect-error: `rhinestone` is not a session domain
    Deployments.define({ name: "devnet", chainId: 31337, v2 });
  });
});
