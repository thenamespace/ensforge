import { assert, describe, it } from "@effect/vitest";

import { Deployments } from "@ensforge/contracts";
import { Ensforge } from "@ensforge/sdk";
import { expectThrow, noRpc, scriptedTransport } from "@ensforge/test-harness";
import {
  createClient,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";

const unknownChain = defineChain({
  id: 31337,
  name: "Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://localhost:8545"] } },
});

const devnet = Deployments.define({
  name: "devnet",
  chainId: 31337,
  v2: { ...Deployments.mainnet.v2, chainId: 31337 },
});

const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);

/** A viem public client that must not be asked anything. */
const publicClient = (chain: Chain = mainnet) => {
  const { transport, calls } = scriptedTransport(noRpc);
  return { client: createPublicClient({ chain, transport }), calls };
};

describe("Ensforge.create deployment resolution", () => {
  it.each([
    [mainnet, Deployments.mainnet],
    [sepolia, Deployments.sepolia],
  ] as const)("picks the built-in deployment of %s", (chain, deployment) => {
    const { client, calls } = publicClient(chain);
    const ens = Ensforge.create({ publicClient: client });

    assert.strictEqual(ens.deployment, deployment);
    assert.deepStrictEqual(ens.chain, { id: chain.id, name: chain.name });
    assert.lengthOf(calls, 0);
  });

  it("fails with UNKNOWN_CHAIN for a chain without a built-in deployment", () => {
    const { client } = publicClient(unknownChain);

    const error = expectThrow(() => Ensforge.create({ publicClient: client }), {
      _tag: "ConfigError",
      code: "UNKNOWN_CHAIN",
    }) as { readonly context: { readonly chainId?: number } };

    assert.strictEqual(error.context.chainId, 31337);
  });

  it("fails with UNKNOWN_CHAIN and a hint when the client has no chain", () => {
    const { transport } = scriptedTransport(noRpc);

    const error = expectThrow(
      () => Ensforge.create({ publicClient: createClient({ transport }) }),
      {
        _tag: "ConfigError",
        code: "UNKNOWN_CHAIN",
      },
    ) as { readonly hint?: string };

    assert.match(error.hint ?? "", /deployment/);
  });

  it("accepts a custom deployment for its chain", () => {
    const { client } = publicClient(unknownChain);
    const ens = Ensforge.create({ publicClient: client, deployment: devnet });

    assert.strictEqual(ens.deployment, devnet);
    assert.deepStrictEqual(ens.chain, { id: 31337, name: "Devnet" });
  });

  it("takes the chain from the deployment when the client has no chain", () => {
    const { transport } = scriptedTransport(noRpc);
    const ens = Ensforge.create({ publicClient: createClient({ transport }), deployment: devnet });

    assert.deepStrictEqual(ens.chain, { id: 31337, name: "devnet" });
  });

  it("rejects a deployment for another chain with INVALID_DEPLOYMENT", () => {
    const { client } = publicClient(mainnet);

    expectThrow(() => Ensforge.create({ publicClient: client, deployment: devnet }), {
      _tag: "ConfigError",
      code: "INVALID_DEPLOYMENT",
    });
  });

  it("rejects an invalid deployment with INVALID_DEPLOYMENT and keeps the cause", () => {
    const { client } = publicClient(unknownChain);
    const broken = { name: "devnet", chainId: 31337 } as Deployments.Profile;

    const error = expectThrow(() => Ensforge.create({ publicClient: client, deployment: broken }), {
      _tag: "ConfigError",
      code: "INVALID_DEPLOYMENT",
    }) as { readonly cause?: { readonly _tag?: string } };

    assert.strictEqual(error.cause?._tag, "Deployments.InvalidProfileError");
  });
});

describe("Ensforge.create config", () => {
  it("fills every default", () => {
    const { client } = publicClient();
    const { config } = Ensforge.create({ publicClient: client });

    assert.deepStrictEqual(config.ccipRead, { gatewayUrls: [] });
    assert.deepStrictEqual(config.batch, { multicall: { batchSize: 16_384, wait: 0 } });
    assert.strictEqual(config.blockTag, "latest");
    assert.strictEqual(config.simulate, true);
    assert.isUndefined(config.indexer);
    assert.isFunction(config.storage.get);
  });

  it.each([
    [{ multicall: false }, { multicall: false }],
    [{ multicall: true }, { multicall: { batchSize: 16_384, wait: 0 } }],
    [{ multicall: { wait: 5 } }, { multicall: { batchSize: 16_384, wait: 5 } }],
    [{ multicall: { batchSize: 1024 } }, { multicall: { batchSize: 1024, wait: 0 } }],
    [{}, { multicall: { batchSize: 16_384, wait: 0 } }],
  ] as const)("resolves batch %j to %j", (batch, expected) => {
    const { client } = publicClient();
    assert.deepStrictEqual(Ensforge.create({ publicClient: client, batch }).config.batch, expected);
  });

  it("freezes the client, its chain and its config", () => {
    const { client } = publicClient();
    const ens = Ensforge.create({ publicClient: client });

    assert.isTrue(Object.isFrozen(ens));
    assert.isTrue(Object.isFrozen(ens.chain));
    assert.isTrue(Object.isFrozen(ens.config));
    assert.throws(() => {
      (ens as { account: unknown }).account = signer.address;
    });
  });
});

describe("Ensforge.create account", () => {
  it("takes the public client's account", () => {
    const { transport } = scriptedTransport(noRpc);
    const client = createClient({ chain: mainnet, transport, account: signer });

    assert.strictEqual(Ensforge.create({ publicClient: client }).account, signer.address);
  });

  it("takes the wallet client's account", () => {
    const { client } = publicClient();
    const { transport } = scriptedTransport(noRpc);
    const walletClient = createWalletClient({ chain: mainnet, transport, account: signer });

    assert.strictEqual(
      Ensforge.create({ publicClient: client, walletClient }).account,
      signer.address,
    );
  });

  it("prefers the account option over the wallet's account", () => {
    const { client } = publicClient();
    const { transport } = scriptedTransport(noRpc);
    const walletClient = createWalletClient({ chain: mainnet, transport, account: signer });
    const account = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";

    const ens = Ensforge.create({ publicClient: client, walletClient, account });

    assert.strictEqual(ens.account, account);
  });

  it("does not read a wallet getter's account at creation", () => {
    const { client } = publicClient();
    let reads = 0;
    const ens = Ensforge.create({
      publicClient: client,
      walletClient: () => {
        reads++;
        return undefined;
      },
    });

    assert.isUndefined(ens.account);
    assert.strictEqual(reads, 0);
  });
});
