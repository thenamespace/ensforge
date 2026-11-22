import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { Abis, Deployments } from "@ensforge/contracts";
import {
  callGas,
  maxWrappedPerTransfer,
  packByGas,
  stepGasBudget,
} from "@ensforge/sdk/internal/internal/migration/gas";
import { encodeFunctionData, zeroAddress } from "viem";

const { nameWrapper } = Deployments.mainnet.v1.contracts;

/** A NameWrapper batch transfer of `ids` tokens. */
const transfer = (ids: number) => ({
  to: nameWrapper,
  data: encodeFunctionData({
    abi: Abis.v1.nameWrapper,
    functionName: "safeBatchTransferFrom",
    args: [zeroAddress, zeroAddress, Arr.makeBy(ids, BigInt), Arr.makeBy(ids, () => 1n), "0x"],
  }),
  value: 0n,
});

// Regression: migration steps were cut at 30 calls, and one ERC-1155 batch carried every wrapped
// name of a holder, so a large migration exceeded a transaction's gas limit.
describe("migration gas", () => {
  it("packs calls into steps that each fit the budget", () => {
    const packs = packByGas(Arr.makeBy(100, () => transfer(1)));

    assert.isAbove(packs.length, 1);
    assert.strictEqual(
      Arr.reduce(packs, 0, (total, pack) => total + pack.calls.length),
      100,
    );
    for (const pack of packs) assert.isTrue(pack.gas <= stepGasBudget);
  });

  it("sizes one batched transfer to fit a step on its own", () => {
    assert.isTrue(callGas(transfer(maxWrappedPerTransfer)) + 80_000n <= stepGasBudget);
    assert.isTrue(callGas(transfer(maxWrappedPerTransfer + 1)) + 80_000n > stepGasBudget);
  });
});
