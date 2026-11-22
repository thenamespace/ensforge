import { Array as Arr, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import { decodeFunctionData, size, toFunctionSelector } from "viem";

import type { Plan } from "../../plan/Plan.js";

// A static cost model, as the ENS app sizes its batches: `eth_estimateGas` cannot price a step
// that depends on an earlier one (the transfer needs the resolver deployed first), and one
// simulated block is capped at the block gas limit. The chain lane checks every estimate against
// real receipts.

/** The gas one migration step may use: within EIP-7825's 2^24 per transaction, with room. */
export const stepGasBudget = 15_000_000n;

/** What every transaction costs on top of its calls. */
export const stepGasOverhead = 80_000n;

// Gas per byte of calldata a call stores (records, resolver initialization): an SSTORE per word.
const perStoredByte = 700n;

const registrarTransfer = toFunctionSelector("safeTransferFrom(address,address,uint256,bytes)");
const wrapperTransfer = toFunctionSelector(
  "safeTransferFrom(address,address,uint256,uint256,bytes)",
);
const wrapperBatch = toFunctionSelector(
  "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)",
);
const deployProxy = toFunctionSelector("deployProxy(address,uint256,bytes)");
const migrationData = "(string,address,address,address)";
const helperMigrate = toFunctionSelector(
  `migrate(${migrationData}[],${migrationData}[][],${migrationData}[][],(bytes,${migrationData}[][])[])`,
);

/** Gas of one migrated NameWrapper token: the most a locked one costs (it deploys a registry). */
export const wrappedTokenGas = 260_000n;

/** The gas a migration call is budgeted at; generous, so a step never exceeds its budget. */
export const callGas = (call: Plan.Call): bigint => {
  const selector = Str.slice(0, 10)(call.data);
  const bytes = BigInt(size(call.data));
  if (selector === registrarTransfer) return 200_000n;
  if (selector === wrapperTransfer) return wrappedTokenGas;
  if (selector === wrapperBatch) {
    const decoded = decodeFunctionData({ abi: Abis.v1.nameWrapper, data: call.data });
    const ids = decoded.functionName === "safeBatchTransferFrom" ? decoded.args[2].length : 1;
    return wrappedTokenGas * BigInt(ids);
  }
  if (selector === deployProxy) return 400_000n + perStoredByte * bytes;
  if (selector === helperMigrate) {
    const decoded = decodeFunctionData({ abi: Abis.v2.migrationHelper, data: call.data });
    if (decoded.functionName !== "migrate") return wrappedTokenGas;
    const [unwrapped, unlocked, locked, children] = decoded.args;
    const names =
      unwrapped.length +
      Arr.reduce([...unlocked, ...locked], 0, (total, group) => total + group.length) +
      Arr.reduce(children, 0, (total, child) =>
        Arr.reduce(child.groups, total, (sum, group) => sum + group.length),
      );
    return wrappedTokenGas * BigInt(names);
  }
  return 60_000n + perStoredByte * bytes;
};

/** The calls packed into steps that each stay within {@link stepGasBudget}, in order. */
export const packByGas = (
  calls: readonly Plan.Call[],
): readonly { readonly calls: readonly Plan.Call[]; readonly gas: bigint }[] => {
  const packs: { calls: Plan.Call[]; gas: bigint }[] = [];
  for (const call of calls) {
    const gas = callGas(call);
    const last = packs.at(-1);
    if (last !== undefined && last.gas + gas <= stepGasBudget) {
      last.calls.push(call);
      last.gas += gas;
    } else {
      packs.push({ calls: [call], gas: stepGasOverhead + gas });
    }
  }
  return packs;
};

/** The most NameWrapper tokens one batched transfer may carry and stay within one step. */
export const maxWrappedPerTransfer = Number((stepGasBudget - stepGasOverhead) / wrappedTokenGas);
