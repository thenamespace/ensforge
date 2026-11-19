import { Context, Effect, Predicate, type FileSystem } from "effect";

import { getAddress, isHex, type Address, type Hash, type TransactionReceipt } from "viem";
import { mnemonicToAccount } from "viem/accounts";

import { loadArtifact } from "../artifacts/files.ts";
import type { ArtifactName } from "../artifacts/sources.ts";
import { devnetClient, type DevnetClient } from "../client.ts";
import { DeployError, type ArtifactError } from "../errors.ts";

/** anvil's default mnemonic: the devnet's accounts are anvil's prefunded ones. */
export const mnemonic = "test test test test test test test test test test test junk";

const account = (addressIndex: number) => mnemonicToAccount(mnemonic, { addressIndex }).address;

/**
 * Named devnet accounts: indices 0–4 as in contracts-v2's devnet (deployer, DAO stand-in, users,
 * root name owner), 5–9 for fixtures.
 */
export const accounts = {
  deployer: account(0),
  owner: account(1),
  user: account(2),
  user2: account(3),
  nameOwner: account(4),
  alice: account(5),
  bob: account(6),
  carol: account(7),
  operator: account(8),
  approved: account(9),
} as const;

export type AccountName = keyof typeof accounts;

/** Genesis timestamp of every profile build: 2026-01-01T00:00:00Z. */
export const genesisTimestamp = 1_767_225_600n;

/** Seconds between the blocks a build mines, one per transaction. */
const blockTime = 12n;

export type Deployed = { readonly address: Address; readonly artifact: ArtifactName };

/** Contracts deployed so far, by key (`v1.registry`, `v2.ethRegistry`, …), in deploy order. */
export type Ledger = Map<string, Deployed>;

export type TxOptions = { readonly from?: AccountName | Address; readonly value?: bigint };

/**
 * Which network's builds a profile deploys. Steps branch on it only where a constructor differs;
 * otherwise `artifacts` swaps the build.
 */
export type Variant = {
  readonly network: "mainnet" | "sepolia";
  readonly artifacts?: Partial<Record<ArtifactName, ArtifactName>>;
};

/** What a step can do: deploy, call and read contracts, and use anvil's cheat RPCs. */
export type StepContext = {
  readonly network: Variant["network"];
  /**
   * The build clock: `now()` is the latest block's timestamp; `advance(seconds)` moves the next
   * block forward, e.g. past a commitment age or an expiry.
   */
  readonly time: { readonly now: () => bigint; readonly advance: (seconds: bigint) => void };
  readonly accounts: typeof accounts;
  readonly address: (key: string) => Effect.Effect<Address, DeployError>;
  readonly deploy: (
    key: string,
    artifact: ArtifactName,
    args?: readonly unknown[],
    options?: TxOptions,
  ) => Effect.Effect<Address, DeployError | ArtifactError, FileSystem.FileSystem>;
  /** Places a `runtime` artifact's code at its mainnet address. */
  readonly place: (
    key: string,
    artifact: ArtifactName,
  ) => Effect.Effect<Address, DeployError | ArtifactError, FileSystem.FileSystem>;
  /** Calls a function of a ledger contract, or of `[address, artifact]`. */
  readonly write: (
    target: string | readonly [Address, ArtifactName],
    functionName: string,
    args?: readonly unknown[],
    options?: TxOptions,
  ) => Effect.Effect<TransactionReceipt, DeployError | ArtifactError, FileSystem.FileSystem>;
  readonly read: <A = unknown>(
    target: string | readonly [Address, ArtifactName],
    functionName: string,
    args?: readonly unknown[],
  ) => Effect.Effect<A, DeployError | ArtifactError, FileSystem.FileSystem>;
  /** Runs a viem action, e.g. `c.cheat((client) => client.setStorageAt(…))`. */
  readonly cheat: <A>(
    action: (client: DevnetClient) => Promise<A>,
  ) => Effect.Effect<A, DeployError>;
};

/**
 * The context of the step being run, for builders that steps share: they read it with
 * `yield* CurrentStep` instead of taking it as an argument.
 */
export class CurrentStep extends Context.Service<CurrentStep, StepContext>()(
  // Service keys are `<package>/<Service>`; this file is not named after the service.
  // oxlint-disable-next-line effecttsgo/deterministic-keys
  "@ensforge/test-devnet/CurrentStep",
) {}

export type Step = {
  readonly id: string;
  readonly run: (
    context: StepContext,
  ) => Effect.Effect<void, DeployError | ArtifactError, FileSystem.FileSystem | CurrentStep>;
};

export const step = (id: string, run: Step["run"]): Step => ({ id, run });

const shortMessage = (cause: unknown): string =>
  Predicate.hasProperty(cause, "shortMessage") ? String(cause.shortMessage) : String(cause);

/**
 * Runs `steps` against an anvil started with `--no-mining`, mining one block per transaction at
 * `genesisTimestamp + n·12s` so a build gives the same state every time.
 */
export const runSteps = Effect.fn("runSteps")(function* (
  rpcUrl: string,
  steps: readonly Step[],
  variant: Variant = { network: "mainnet" },
) {
  const client = devnetClient(rpcUrl);
  const ledger: Ledger = new Map();
  let next = genesisTimestamp;

  for (const { id, run } of steps) {
    const attempt = <A>(promise: () => Promise<A>) =>
      Effect.tryPromise({
        try: promise,
        catch: (cause) => DeployError.make({ step: id, message: shortMessage(cause) }),
      });

    const sender = (from: TxOptions["from"] = "deployer"): Address =>
      isHex(from) ? from : accounts[from];

    const resolve = Effect.fnUntraced(function* (
      target: string | readonly [Address, ArtifactName],
    ) {
      if (typeof target !== "string") return { address: target[0], artifact: target[1] };
      const deployed = ledger.get(target);
      if (deployed === undefined)
        return yield* DeployError.make({ step: id, message: `${target} is not deployed yet` });
      return deployed;
    });

    // Mines a sent transaction alone in the next block. viem estimates gas when sending, so most
    // reverts fail there with their reason; others are replayed on the parent block for it.
    const mined = Effect.fnUntraced(function* (send: () => Promise<Hash>) {
      const hash = yield* attempt(send);
      next += blockTime;
      yield* attempt(() => client.setNextBlockTimestamp({ timestamp: next }));
      yield* attempt(() => client.mine({ blocks: 1 }));
      const receipt = yield* attempt(() => client.getTransactionReceipt({ hash }));
      if (receipt.status === "success") return receipt;

      const transaction = yield* attempt(() => client.getTransaction({ hash }));
      const reason = yield* Effect.tryPromise({
        try: () =>
          client.call({
            account: transaction.from,
            to: transaction.to,
            data: transaction.input,
            blockNumber: receipt.blockNumber - 1n,
          }),
        catch: shortMessage,
      }).pipe(
        Effect.match({
          onFailure: (message) => message,
          onSuccess: () => "no reason",
        }),
      );
      return yield* DeployError.make({ step: id, message: `${hash} reverted: ${reason}` });
    });

    const context: StepContext = {
      network: variant.network,
      time: {
        now: () => next,
        advance: (seconds) => {
          next += seconds;
        },
      },
      accounts,
      address: (key) => resolve(key).pipe(Effect.map((deployed) => deployed.address)),
      deploy: (key, requested, args = [], options = {}) =>
        Effect.gen(function* () {
          const artifact = variant.artifacts?.[requested] ?? requested;
          if (ledger.has(key))
            return yield* DeployError.make({ step: id, message: `${key} is already deployed` });
          const { abi, bytecode } = yield* loadArtifact(artifact);
          const receipt = yield* mined(() =>
            client.deployContract({
              abi,
              bytecode,
              args: [...args],
              account: sender(options.from),
              chain: null,
              ...(options.value === undefined ? {} : { value: options.value }),
            }),
          );
          const address = receipt.contractAddress && getAddress(receipt.contractAddress);
          if (address === null || address === undefined)
            return yield* DeployError.make({ step: id, message: `${artifact} has no address` });
          ledger.set(key, { address, artifact });
          return address;
        }),
      place: (key, artifact) =>
        Effect.gen(function* () {
          const { bytecode, source } = yield* loadArtifact(artifact);
          if (source.kind !== "runtime")
            return yield* DeployError.make({
              step: id,
              message: `${artifact} is not runtime code`,
            });
          yield* attempt(() => client.setCode({ address: source.address, bytecode }));
          ledger.set(key, { address: source.address, artifact });
          return source.address;
        }),
      write: (target, functionName, args = [], options = {}) =>
        Effect.gen(function* () {
          const { address, artifact } = yield* resolve(target);
          const { abi } = yield* loadArtifact(artifact);
          return yield* mined(() =>
            client.writeContract({
              address,
              abi,
              functionName,
              args: [...args],
              account: sender(options.from),
              chain: null,
              ...(options.value === undefined ? {} : { value: options.value }),
            }),
          );
        }),
      read: <A>(
        target: string | readonly [Address, ArtifactName],
        functionName: string,
        args: readonly unknown[] = [],
      ) =>
        Effect.gen(function* () {
          const { address, artifact } = yield* resolve(target);
          const { abi } = yield* loadArtifact(artifact);
          const result = yield* attempt(() =>
            client.readContract({ address, abi, functionName, args: [...args] }),
          );
          // The caller states the result type; the ABI is only known at runtime.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          return result as A;
        }),
      cheat: (action) => attempt(() => action(client)),
    };

    yield* Effect.logDebug(`step ${id}`);
    yield* run(context).pipe(Effect.provideService(CurrentStep, context));
  }

  return ledger;
});
