import { Array as Arr, Context, Effect, Layer } from "effect";

import { predictVerifiableProxyAddress } from "@ensforge/contracts/v2";
import {
  hcaDeploymentSalt,
  hcaSessionPermissionId,
  standaloneHcaFactoryV2Abi,
} from "@ensforge/contracts/v2/experimental/hca";
import type { RhinestoneAccount, RhinestoneSdk } from "@ensforge/hca";
import { Chain, Devnet } from "@ensforge/test-devnet";
import {
  concat,
  encodePacked,
  hexToBigInt,
  hexToNumber,
  numberToHex,
  parseAbi,
  parseSignature,
  size,
  slice,
  toHex,
  zeroAddress,
  type Account,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { toAccount } from "viem/accounts";

// A Rhinestone SDK stand-in on the devnet. It packs session intents the way the ENS app's patch of
// `@rhinestone/sdk@1.22.0` does (`buildStandaloneHcaEnableProof`, `packIntentOperation`, the 0x05
// fixed-session envelope), from exactly what `rhinestone()` hands it, and fills them through the
// devnet's `MockRegistrationIntentExecutor`, so the deployed validator checks every intent.

const intentExecutorAbi = parseAbi([
  "struct Execution { address target; uint256 value; bytes callData; }",
  "function executeWithSession(address account, Execution[] executions, uint256 nonce, bytes signature) returns (bytes[])",
  "function singleChainDigest(address account, uint256 nonce, Execution[] executions) view returns (bytes32)",
]);

type Call = { readonly to: Address; readonly data: Hex; readonly value?: bigint | undefined };
type SessionSigners = {
  readonly type: "experimental_session";
  readonly session: {
    readonly salt: Hex;
    readonly owners: { readonly accounts: readonly Account[] };
  };
  readonly enableData: {
    readonly userSignature: Hex;
    readonly hashesAndChainIds: readonly {
      readonly chainId: bigint;
      readonly sessionDigest: Hex;
    }[];
    readonly sessionToEnableIndex: number;
    readonly hcaSessionNonce?: bigint | undefined;
    readonly hcaSessionConfig?:
      | {
          readonly sessionKey: Address;
          readonly validUntil: number;
          readonly resolver: Address;
          readonly refundToken: Address;
          readonly maxRefundExchangeRate: bigint;
          readonly maxRefundGasOverhead: number;
          readonly maxRefundAmount: bigint;
        }
      | undefined;
  };
};
type Transaction = { readonly calls: readonly Call[]; readonly signers?: SessionSigners };
type Signed = { readonly calls: readonly Call[]; readonly nonce: bigint; readonly signature: Hex };

/** `rhinestone()`'s calls as ERC-7579 executions. */
const executions = (calls: readonly Call[]) =>
  Arr.map(calls, (call) => ({
    target: call.to,
    value: call.value ?? 0n,
    callData: call.data,
  }));

/** The patch's `buildStandaloneHcaEnableProof`: the session terms and the owner's approval. */
const enableProof = (signers: SessionSigners): Hex => {
  const { enableData } = signers;
  const config = enableData.hcaSessionConfig;
  if (config === undefined) throw new Error("Standalone HCA session configuration is missing");
  if (enableData.hcaSessionNonce === undefined) {
    throw new Error("Standalone HCA enable operation does not match its session");
  }
  const { userSignature } = enableData;
  if (size(userSignature) !== 85 || slice(userSignature, 0, 20) !== zeroAddress) {
    throw new Error("Standalone HCA owner authorization has an unexpected shape");
  }
  const owner = parseSignature(slice(userSignature, 20));

  return concat([
    encodePacked(
      ["address", "uint48", "uint96", "address", "address", "uint96", "uint48", "uint96"],
      [
        config.sessionKey,
        config.validUntil,
        enableData.hcaSessionNonce,
        config.resolver,
        config.refundToken,
        config.maxRefundExchangeRate,
        config.maxRefundGasOverhead,
        config.maxRefundAmount,
      ],
    ),
    toHex(enableData.sessionToEnableIndex, { size: 1 }),
    toHex(enableData.hashesAndChainIds.length, { size: 1 }),
    ...Arr.map(enableData.hashesAndChainIds, (entry) =>
      encodePacked(["uint64", "bytes32"], [entry.chainId, entry.sessionDigest]),
    ),
    owner.r,
    owner.s,
    toHex(Number(owner.v ?? BigInt(27 + (owner.yParity ?? 0))), { size: 1 }),
  ]);
};

/** The devnet's Rhinestone: an SDK for `rhinestone({ sdk })`, and signers for session keys. */
export class Rhinestone extends Context.Service<
  Rhinestone,
  {
    readonly sdk: RhinestoneSdk;
    /** A session key's signer over a devnet account (`eth_sign`). */
    readonly signer: (address: Address) => Account;
    /** How many intents were filled. */
    readonly filled: () => number;
  }
  // Service keys are `<package>/<Service>`; this file is not named after the service.
  // oxlint-disable-next-line effecttsgo/deterministic-keys
>()("@ensforge/test-integration/Rhinestone") {
  static readonly layer = Layer.effect(
    Rhinestone,
    Effect.gen(function* () {
      const devnet = yield* Devnet;
      const chain = yield* Chain;
      const context = yield* Effect.context();
      const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromiseWith(context)(effect);
      const executor = devnet.contract("hca.intentExecutor");
      const fills: Hash[] = [];
      let nonce = 0n;

      const sign = Effect.fnUntraced(function* (transaction: Transaction, hca: Address) {
        const signers = transaction.signers;
        const [sessionKey] = signers?.session.owners.accounts ?? [];
        if (signers?.type !== "experimental_session" || sessionKey === undefined) {
          return yield* Effect.die("the devnet Rhinestone fills session intents only");
        }
        const proof = enableProof(signers);
        nonce += 1n;
        const digest = yield* chain.read({
          address: executor,
          abi: intentExecutorAbi,
          functionName: "singleChainDigest",
          args: [hca, nonce, executions(transaction.calls)],
        });
        const raw = yield* chain.sign(sessionKey.address, digest);
        // v + 4 tells the validator the session key signed with EIP-191.
        const sessionSignature = concat([
          slice(raw, 0, 64),
          toHex(hexToNumber(slice(raw, 64)) + 4),
        ]);
        const operation = concat([
          "0x0201",
          numberToHex(transaction.calls.length, { size: 1 }),
          ...Arr.flatMap(transaction.calls, (call) => [
            call.to,
            numberToHex(size(call.data), { size: 3 }),
            call.data,
          ]),
        ]);
        const permissionId = hcaSessionPermissionId({
          sessionKey: sessionKey.address,
          salt: signers.session.salt,
        });

        return {
          calls: transaction.calls,
          nonce,
          signature: concat([
            zeroAddress,
            encodePacked(
              [
                "bytes1",
                "bytes32",
                "bytes",
                "uint256",
                "address",
                "uint96",
                "uint96",
                "uint48",
                "bytes",
                "bytes",
              ],
              [
                "0x05",
                permissionId,
                proof,
                nonce,
                zeroAddress,
                0n,
                0n,
                0,
                operation,
                sessionSignature,
              ],
            ),
          ]),
        } satisfies Signed;
      });

      const createAccount = (config: unknown): Promise<RhinestoneAccount> => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the shape `rhinestone()` passes
        const { account, owners, initData } = config as {
          readonly account: {
            readonly factory: Address;
            readonly implementation: Address;
            readonly verifiableFactory: Address;
            readonly proxyLogic: Address;
          };
          readonly owners: { readonly accounts: readonly Account[] };
          readonly initData?: { readonly address: Address };
        };
        const [owner] = owners.accounts;
        if (owner === undefined) return Promise.reject(new Error("no owner"));
        const address =
          initData?.address ??
          predictVerifiableProxyAddress({
            factory: account.verifiableFactory,
            proxyLogic: account.proxyLogic,
            deployer: account.factory,
            salt: hexToBigInt(
              hcaDeploymentSalt({ owner: owner.address, implementation: account.implementation }),
            ),
          });

        return Promise.resolve({
          getAddress: () => address,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the shape `rhinestone()` passes
          prepareTransaction: (transaction) => Promise.resolve(transaction as Transaction),
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- what `prepareTransaction` returned
          signTransaction: (prepared) => run(sign(prepared as Transaction, address)),
          submitTransaction: (signed) =>
            run(
              Effect.gen(function* () {
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- what `signTransaction` returned
                const intent = signed as Signed;
                // Intents deploy the HCA on first use; the factory's `deploy` is permissionless.
                const code = yield* chain.code(address);
                if (code === undefined) {
                  yield* chain.write({
                    address: account.factory,
                    abi: standaloneHcaFactoryV2Abi,
                    functionName: "deploy",
                    args: [owner.address, account.implementation, 0n],
                    account: devnet.accounts.deployer,
                  });
                }
                const receipt = yield* chain.write({
                  address: executor,
                  abi: intentExecutorAbi,
                  functionName: "executeWithSession",
                  args: [address, executions(intent.calls), intent.nonce, intent.signature],
                  account: devnet.accounts.deployer,
                });
                fills.push(receipt.transactionHash);
                return { id: BigInt(fills.length - 1) };
              }),
            ),
        });
      };

      return {
        sdk: {
          createAccount,
          getIntentStatus: (id) => {
            const hash = fills[Number(id)];
            return Promise.resolve(
              hash === undefined ? { status: "PENDING" } : { status: "COMPLETED", fill: { hash } },
            );
          },
        },
        signer: (address) =>
          toAccount({
            address,
            signMessage: ({ message }) =>
              run(
                chain.sign(
                  address,
                  typeof message === "string" ? toHex(message) : toHex(message.raw),
                ),
              ),
            signTransaction: () => Promise.reject(new Error("session keys sign intents only")),
            signTypedData: () => Promise.reject(new Error("session keys sign intents only")),
          }),
        filled: () => fills.length,
      };
    }),
  );
}
