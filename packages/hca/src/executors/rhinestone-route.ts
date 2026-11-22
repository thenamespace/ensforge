import { Array as Arr, Option, Record as Rec, Schema, String as Str } from "effect";

import type { Plan } from "@ensforge/sdk";
import {
  encodeFunctionData,
  erc20Abi,
  hashTypedData,
  isAddressEqual,
  zeroAddress,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from "viem";

// The orchestrator's prepared route is untrusted data: for an owner-signed intent nothing on
// chain limits what it runs, so ensforge checks it against the request before anything is signed
// (as the ENS app's `checkOwnerIntentRoute` does). Session intents are bounded on chain by the
// validator; for them only the refund is checked here, against the session's caps.

/** IntentExecutor `Type.ERC7579` + `SigMode.ERC1271`: the call array runs as one atomic batch. */
const ownerMode: Hex = `0x0201${Str.repeat(30)("00")}`;

const Uint = Schema.Union([Schema.BigInt, Schema.BigIntFromString]);
const HexString = Schema.TemplateLiteral(["0x", Schema.String]);
const None = Schema.Array(Schema.Unknown).check(Schema.isMaxLength(0));

const GasRefund = Schema.Struct({ token: HexString, exchangeRate: Uint, overhead: Uint });

/** A single-chain, unfunded IntentExecutor route: the only shape ensforge signs. */
const Route = Schema.Struct({
  intentOp: Schema.Struct({
    sponsor: HexString,
    nonce: Schema.optional(Uint),
    elements: Schema.Tuple([
      Schema.Struct({
        chainId: Uint,
        idsAndAmounts: None,
        spendTokens: None,
        mandate: Schema.Struct({
          recipient: HexString,
          destinationChainId: Uint,
          tokenOut: None,
          preClaimOps: Schema.Struct({ ops: None }),
          destinationOps: Schema.Struct({
            vt: HexString,
            ops: Schema.Array(Schema.Struct({ to: HexString, value: Uint, data: HexString })),
          }),
          qualifier: Schema.Struct({
            settlementContext: Schema.Struct({
              settlementLayer: Schema.Literal("INTENT_EXECUTOR"),
              fundingMethod: Schema.Literal("NO_FUNDING"),
              using7579: Schema.Literal(true),
              gasRefund: GasRefund,
            }),
          }),
        }),
      }),
    ]),
  }),
});

// Only the fields a quote reads; anything else in the route may differ.
const Quoted = Schema.Struct({
  intentRoute: Schema.Struct({
    intentOp: Schema.Struct({
      elements: Schema.Array(
        Schema.Struct({
          mandate: Schema.Struct({
            qualifier: Schema.Struct({
              settlementContext: Schema.Struct({ gasRefund: GasRefund }),
            }),
          }),
        }),
      ),
      signedMetadata: Schema.optional(
        Schema.Struct({
          gasPrices: Schema.optional(Schema.Record(Schema.String, Schema.String)),
        }),
      ),
    }),
    intentCost: Schema.optional(
      Schema.Struct({
        tokensSpent: Schema.optional(
          Schema.Record(
            Schema.String,
            Schema.Record(
              Schema.String,
              Schema.Struct({
                locked: Schema.optional(Schema.String),
                unlocked: Schema.optional(Schema.String),
              }),
            ),
          ),
        ),
      }),
    ),
  }),
});

/** A route's gas refund: the token, its price in gas, the signed cap and the gas overhead. */
export type RouteRefund = {
  readonly token: Address;
  readonly exchangeRate: bigint;
  /** The most the executor may pull (`overhead >> 128`). */
  readonly amount: bigint;
  readonly gasOverhead: bigint;
};

const refundOf = (gasRefund: typeof GasRefund.Type): RouteRefund => ({
  token: gasRefund.token,
  exchangeRate: gasRefund.exchangeRate,
  amount: gasRefund.overhead >> 128n,
  gasOverhead: gasRefund.overhead & ((1n << 128n) - 1n),
});

/** The gas refund a prepared transaction would be signed with; `undefined` when it has none. */
export const routeRefund = (prepared: unknown): RouteRefund | undefined => {
  const quoted = Schema.decodeUnknownOption(Quoted)(prepared);
  if (Option.isNone(quoted)) return undefined;
  const [element] = quoted.value.intentRoute.intentOp.elements;
  if (element === undefined) return undefined;
  const refund = refundOf(element.mandate.qualifier.settlementContext.gasRefund);
  return isAddressEqual(refund.token, zeroAddress) ? undefined : refund;
};

/**
 * What a quoted route costs in its refund token: the larger of the spend the orchestrator quotes
 * and the most its refund can pull for `gasLimit` (`(gas + 2 × overhead) × gas price × rate`,
 * with headroom for the relayer's gas price; the ENS app's `legFeeUsdc`), never above the
 * signed cap.
 */
export const routeFee = (
  prepared: unknown,
  options: { readonly chainId: number; readonly gasLimit: bigint },
): { readonly refund: RouteRefund; readonly amount: bigint } | undefined => {
  const refund = routeRefund(prepared);
  const quoted = Schema.decodeUnknownOption(Quoted)(prepared);
  if (refund === undefined || Option.isNone(quoted)) return undefined;
  const route = quoted.value.intentRoute;

  // The orchestrator echoes token addresses in lowercase.
  const spent = Option.getOrUndefined(
    Arr.findFirst(
      Rec.toEntries(route.intentCost?.tokensSpent?.[String(options.chainId)] ?? {}),
      ([token]) => Str.toLowerCase(token) === Str.toLowerCase(refund.token),
    ),
  )?.[1];
  const spend =
    spent === undefined ? 0n : BigInt(spent.locked ?? "0") + BigInt(spent.unlocked ?? "0");
  const gasPrice = route.intentOp.signedMetadata?.gasPrices?.[String(options.chainId)];
  const pull =
    gasPrice === undefined
      ? refund.amount
      : ((options.gasLimit + 2n * refund.gasOverhead) * BigInt(gasPrice) * refund.exchangeRate +
          10n ** 18n -
          1n) /
        10n ** 18n;
  const capped = refund.amount > 0n && pull > refund.amount ? refund.amount : pull;
  return { refund, amount: capped > spend ? capped : spend };
};

/** Refund ceilings: a session's terms, or the owner's limits for owner-signed intents. */
export type RefundCaps = {
  readonly token: Address;
  readonly maxExchangeRate: bigint;
  readonly maxGasOverhead: bigint;
  readonly maxAmount: bigint;
};

/** Each way `refund` exceeds `caps`, as `field: quoted > cap`. */
export const refundViolations = (refund: RouteRefund, caps: RefundCaps): readonly string[] => [
  ...(isAddressEqual(refund.token, caps.token) ? [] : [`refund token ${refund.token}`]),
  ...(refund.exchangeRate > caps.maxExchangeRate
    ? [`exchange rate ${refund.exchangeRate} > ${caps.maxExchangeRate}`]
    : []),
  ...(refund.gasOverhead > caps.maxGasOverhead
    ? [`gas overhead ${refund.gasOverhead} > ${caps.maxGasOverhead}`]
    : []),
  ...(refund.amount > caps.maxAmount ? [`refund amount ${refund.amount} > ${caps.maxAmount}`] : []),
];

/** The EIP-712 `SingleChainOps` an owner signs for the IntentExecutor. */
const singleChainOps = (options: {
  readonly chainId: number;
  readonly intentExecutor: Address;
  readonly hca: Address;
  readonly nonce: bigint;
  readonly ops: readonly Plan.Call[];
  readonly gasRefund: typeof GasRefund.Type;
}): TypedDataDefinition => ({
  domain: {
    name: "IntentExecutor",
    version: "v0.0.1",
    chainId: options.chainId,
    verifyingContract: options.intentExecutor,
  },
  types: {
    SingleChainOps: [
      { name: "account", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "op", type: "Op" },
      { name: "gasRefund", type: "GasRefund" },
    ],
    Op: [
      { name: "vt", type: "bytes32" },
      { name: "ops", type: "Ops[]" },
    ],
    Ops: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    GasRefund: [
      { name: "token", type: "address" },
      { name: "exchangeRate", type: "uint256" },
      { name: "overhead", type: "uint256" },
    ],
  },
  primaryType: "SingleChainOps",
  message: {
    account: options.hca,
    nonce: options.nonce,
    op: { vt: ownerMode, ops: Arr.map(options.ops, (op) => ({ ...op })) },
    gasRefund: options.gasRefund,
  },
});

/**
 * Why an owner-signed route is not what ensforge asked for; empty when it is. The route must run
 * exactly `calls` (after at most one fee approval to the gas-refund paymaster) from the HCA, on
 * this chain, with no funding or claims, and a refund within `caps`. With the SDK's signing
 * messages, they must sign that same `SingleChainOps`.
 */
export const routeProblems = (
  prepared: unknown,
  expected: {
    readonly chainId: number;
    readonly hca: Address;
    readonly calls: readonly Plan.Call[];
    readonly intentExecutor: Address;
    readonly gasRefundPaymaster: Address;
    readonly caps: RefundCaps;
    readonly messages?:
      | {
          readonly origin: readonly TypedDataDefinition[];
          readonly destination: TypedDataDefinition;
        }
      | undefined;
  },
): readonly string[] => {
  const decoded = Schema.decodeUnknownOption(Schema.Struct({ intentRoute: Route }))(prepared);
  if (Option.isNone(decoded)) return ["not a single-chain, unfunded IntentExecutor route"];
  const { intentOp } = decoded.value.intentRoute;
  const [element] = intentOp.elements;
  const { mandate } = element;
  const { gasRefund } = mandate.qualifier.settlementContext;
  const refund = refundOf(gasRefund);
  const chainId = BigInt(expected.chainId);

  const feeApproval: Plan.Call = {
    to: refund.token,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [expected.gasRefundPaymaster, refund.amount],
    }),
  };
  const { ops } = mandate.destinationOps;
  const calls =
    ops.length === expected.calls.length + 1 ? [feeApproval, ...expected.calls] : expected.calls;
  const sameOps =
    ops.length === calls.length &&
    Arr.every(
      Arr.zip(ops, calls),
      ([op, call]) =>
        isAddressEqual(op.to, call.to) &&
        op.value === call.value &&
        Str.toLowerCase(op.data) === Str.toLowerCase(call.data),
    );

  const problems = [
    ...(isAddressEqual(intentOp.sponsor, expected.hca) ? [] : [`sponsor ${intentOp.sponsor}`]),
    ...(isAddressEqual(mandate.recipient, expected.hca) ? [] : [`recipient ${mandate.recipient}`]),
    ...(element.chainId === chainId && mandate.destinationChainId === chainId ? [] : ["chain"]),
    ...(Str.toLowerCase(mandate.destinationOps.vt) === ownerMode ? [] : ["execution mode"]),
    ...(sameOps ? [] : ["calls differ from the request"]),
    // A sponsored route carries no refund.
    ...(isAddressEqual(refund.token, zeroAddress) && refund.amount === 0n
      ? []
      : refundViolations(refund, expected.caps)),
  ];
  if (problems.length > 0 || expected.messages === undefined) return problems;

  if (intentOp.nonce === undefined) return ["no nonce to sign"];
  const signed = hashTypedData(
    singleChainOps({
      chainId: expected.chainId,
      intentExecutor: expected.intentExecutor,
      hca: expected.hca,
      nonce: intentOp.nonce,
      ops: calls,
      gasRefund,
    }),
  );
  const { origin, destination } = expected.messages;
  return origin.length === 1 &&
    Arr.every(origin, (message) => hashTypedData(message) === signed) &&
    hashTypedData(destination) === signed
    ? []
    : ["the signing payload differs from the route"];
};
