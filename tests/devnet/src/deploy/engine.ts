import { Effect, type FileSystem } from "effect";

import { getAddress, type Address, type Hash, type TransactionReceipt } from "viem";
import { mnemonicToAccount } from "viem/accounts";

import { loadArtifact } from "../artifacts/files.ts";
import type { ArtifactName } from "../artifacts/sources.ts";
import { devnetClient, type DevnetClient } from "../client.ts";
import { DeployError, type ArtifactError } from "../errors.ts";

/** anvil's default mnemonic: the devnet's accounts are anvil's prefunded ones. */
const mnemonic = "test test test test test test test test test test test junk";

/** Named devnet accounts (anvil indices 0–4), as in contracts-v2's devnet. */
export const accounts = {
  deployer: mnemonicToAccount(mnemonic, { addressIndex: 0 }).address,
  owner: mnemonicToAccount(mnemonic, { addressIndex: 1 }).address,
  user: mnemonicToAccount(mnemonic, { addressIndex: 2 }).address,
  user2: mnemonicToAccount(mnemonic, { addressIndex: 3 }).address,
  nameOwner: mnemonicToAccount(mnemonic, { addressIndex: 4 }).address,
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

/** What a step can do: deploy, call and read contracts, and use anvil's cheat RPCs. */
export type StepContext = {
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

export type Step = {
  readonly id: string;
  readonly run: (
    context: StepContext,
  ) => Effect.Effect<void, DeployError | ArtifactError, FileSystem.FileSystem>;
};

export const step = (id: string, run: Step["run"]): Step => ({ id, run });

const shortMessage = (cause: unknown): string =>
  typeof cause === "object" && cause !== null && "shortMessage" in cause
    ? String((cause as { shortMessage: unknown }).shortMessage)
    : String(cause);

/**
 * Runs `steps` against an anvil started with `--no-mining`, mining one block per transaction at
 * `genesisTimestamp + n·12s` so a build gives the same state every time.
 */
export const runSteps = Effect.fn("runSteps")(function* (rpcUrl: string, steps: readonly Step[]) {
  const client = devnetClient(rpcUrl);
  const ledger: Ledger = new Map();
  let next = genesisTimestamp;

  for (const { id, run } of steps) {
    const attempt = <A>(promise: () => Promise<A>) =>
      Effect.tryPromise({
        try: promise,
        catch: (cause) => new DeployError({ step: id, message: shortMessage(cause) }),
      });

    const sender = (from: TxOptions["from"] = "deployer"): Address =>
      from.startsWith("0x") ? (from as Address) : accounts[from as AccountName];

    const resolve = Effect.fnUntraced(function* (
      target: string | readonly [Address, ArtifactName],
    ) {
      if (typeof target !== "string") return { address: target[0], artifact: target[1] };
      const deployed = ledger.get(target);
      if (deployed === undefined)
        return yield* new DeployError({ step: id, message: `${target} is not deployed yet` });
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
      const reason = yield* Effect.tryPromise(() =>
        client.call({
          account: transaction.from,
          to: transaction.to,
          data: transaction.input,
          blockNumber: receipt.blockNumber - 1n,
        }),
      ).pipe(
        Effect.match({
          onFailure: (error) => shortMessage(error.cause),
          onSuccess: () => "no reason",
        }),
      );
      return yield* new DeployError({ step: id, message: `${hash} reverted: ${reason}` });
    });

    const context: StepContext = {
      accounts,
      address: (key) => resolve(key).pipe(Effect.map((deployed) => deployed.address)),
      deploy: (key, artifact, args = [], options = {}) =>
        Effect.gen(function* () {
          if (ledger.has(key))
            return yield* new DeployError({ step: id, message: `${key} is already deployed` });
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
            return yield* new DeployError({ step: id, message: `${artifact} has no address` });
          ledger.set(key, { address, artifact });
          return address;
        }),
      place: (key, artifact) =>
        Effect.gen(function* () {
          const { bytecode, source } = yield* loadArtifact(artifact);
          if (source.kind !== "runtime")
            return yield* new DeployError({ step: id, message: `${artifact} is not runtime code` });
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
          return (yield* attempt(() =>
            client.readContract({ address, abi, functionName, args: [...args] }),
          )) as A;
        }),
      cheat: (action) => attempt(() => action(client)),
    };

    yield* Effect.logDebug(`step ${id}`);
    yield* run(context);
  }

  return ledger;
});
