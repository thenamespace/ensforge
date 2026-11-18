import { Array, Option, Record, String as Str } from "effect";

import { Abis } from "@ensforge/contracts";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  numberToHex,
  toHex,
  type AbiEvent,
  type AbiParameter,
  type Address,
  type Hex,
  type Log,
} from "viem";

/** Every event variant ensforge decodes, straight from the contracts package. */
export const events = Abis.shared.events as readonly AbiEvent[];

export const signatureOf = (event: AbiEvent): string =>
  `${event.name}(${Array.join(
    Array.map(event.inputs, (input) => input.type),
    ",",
  )})`;

/** A fixed, valid value for each ABI type used by the ENS events. */
const sample = (input: AbiParameter, index: number): unknown => {
  switch (input.type) {
    case "address":
      return getAddress(`0x${Str.padStart(40, "0")((0xa000 + index).toString(16))}`);
    case "bool":
      return true;
    case "bytes32":
      return keccak256(toHex(`${input.name}-${index}`));
    case "bytes4":
      return "0x12345678";
    case "bytes":
      return "0xc0ffee";
    case "string":
      return `value${index}`;
    case "uint32":
      return 7 + index;
    case "uint256[]":
      return [1n, 2n];
    default:
      if (Str.startsWith("uint")(input.type)) return BigInt(100 + index);
      throw new Error(`No sample for ${input.type}`);
  }
};

/** Builds a mined log of `event` with `args`, encoded independently with viem. */
export const logOf = (
  event: AbiEvent,
  args: Readonly<Record<string, unknown>>,
  options: { readonly address: Address; readonly blockNumber?: bigint; readonly logIndex?: number },
): Log => {
  const nonIndexed = Array.filter(event.inputs, (input) => input.indexed !== true);
  const indexedArgs = Record.fromEntries(
    Array.map(
      Array.filter(event.inputs, (input) => input.indexed === true),
      (input) => [input.name ?? "", args[input.name ?? ""]],
    ),
  );
  // Every indexed argument is given, so no topic is null; viem's type cannot know that.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const topics = encodeEventTopics({
    abi: [event],
    eventName: event.name,
    args: indexedArgs,
  }) as [Hex, ...Hex[]];

  return {
    address: options.address,
    topics,
    data: encodeAbiParameters(
      nonIndexed,
      Array.map(nonIndexed, (input) => args[input.name ?? ""]),
    ),
    blockNumber: options.blockNumber ?? 10n,
    blockHash: keccak256(toHex(`block-${options.blockNumber ?? 10n}`)),
    transactionHash: keccak256(toHex(`tx-${options.blockNumber ?? 10n}-${options.logIndex ?? 0}`)),
    transactionIndex: 0,
    logIndex: options.logIndex ?? 0,
    removed: false,
  };
};

/** Sample arguments for every input of `event`. */
export const sampleArgs = (event: AbiEvent): Record<string, unknown> =>
  Record.fromEntries(
    Array.map(event.inputs, (input, index) => [input.name ?? "", sample(input, index)]),
  );

/** The event whose signature is `signature`, such as `NewOwner(bytes32,bytes32,address)`. */
export const eventBySignature = (signature: string): AbiEvent =>
  Option.getOrThrowWith(
    Array.findFirst(events, (candidate) => signatureOf(candidate) === signature),
    () => new Error(`Unknown event ${signature}`),
  );

/** A mined log as a node answers `eth_getLogs`, with its numbers hex-encoded. */
export const rpcLog = (log: Log) => ({
  ...log,
  blockNumber: numberToHex(log.blockNumber ?? 0n),
  logIndex: numberToHex(log.logIndex ?? 0),
  transactionIndex: numberToHex(log.transactionIndex ?? 0),
});
