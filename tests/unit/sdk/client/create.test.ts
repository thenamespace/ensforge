import { assert, describe, it } from "@effect/vitest";
import { String as Str } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Ensforge } from "@ensforge/sdk";
import { expectThrow, noRpc, scriptedTransport } from "@ensforge/test-harness";
import { createWalletClient, defineChain, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet, sepolia } from "viem/chains";

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

const signer = privateKeyToAccount(`0x${Str.repeat(32)("11")}`);

/** A client on `chain` whose transport must not be asked anything, and no public RPCs. */
const clientOn = (chain: Chain = mainnet, options: Partial<Ensforge.CreateOptions> = {}) => {
  const { transport, calls } = scriptedTransport(noRpc);
  const ens = Ensforge.create({
    chain,
    transports: { [chain.id]: transport },
    publicRpc: false,
    ...options,
  });
  return { ens, calls };
};

describe("Ensforge.create deployment resolution", () => {
  it.each([
    [mainnet, Deployments.mainnet],
    [sepolia, Deployments.sepolia],
  ] as const)("picks the built-in deployment of %s", (chain, deployment) => {
    const { ens, calls } = clientOn(chain);

    assert.strictEqual(ens.deployment, deployment);
    assert.deepStrictEqual(ens.chain, { id: chain.id, name: chain.name });
    assert.lengthOf(calls, 0);
  });

  it("fails with UNKNOWN_CHAIN and a hint for a chain without a built-in deployment", () => {
    const error = expectThrow(() => clientOn(unknownChain), {
      _tag: "ConfigError",
      code: "UNKNOWN_CHAIN",
    });

    assert.nestedPropertyVal(error, "context.chainId", 31337);
    assert.match(Reflect.get(error, "hint") ?? "", /deployment/);
  });

  it("accepts a custom deployment for its chain", () => {
    const { ens } = clientOn(unknownChain, { deployment: devnet });

    assert.strictEqual(ens.deployment, devnet);
    assert.deepStrictEqual(ens.chain, { id: 31337, name: "Devnet" });
  });

  it("rejects a deployment for another chain with INVALID_DEPLOYMENT", () => {
    expectThrow(() => clientOn(mainnet, { deployment: devnet }), {
      _tag: "ConfigError",
      code: "INVALID_DEPLOYMENT",
    });
  });

  it("rejects an invalid deployment with INVALID_DEPLOYMENT and keeps the cause", () => {
    const broken = { name: "devnet", chainId: 31337 } as Deployments.Profile;

    const error = expectThrow(() => clientOn(unknownChain, { deployment: broken }), {
      _tag: "ConfigError",
      code: "INVALID_DEPLOYMENT",
    });

    assert.nestedPropertyVal(error, "cause._tag", "Deployments.InvalidProfileError");
  });
});

describe("Ensforge.create transports", () => {
  it("reads the ENS chain through its transport, building the client once", () => {
    const { ens } = clientOn(mainnet, { pollingInterval: 50 });

    assert.strictEqual(ens.client(), ens.client(mainnet.id));
    assert.strictEqual(ens.client().chain?.id, mainnet.id);
    assert.strictEqual(ens.client().pollingInterval, 50);
  });

  it("works without configuration, on the ENS chain's public RPC", () => {
    const ens = Ensforge.create({ chain: mainnet });

    assert.strictEqual(ens.client().transport.url, mainnet.rpcUrls.default.http[0]);
  });

  // Names can live on an L2: ensforge reaches the chains it knows without a transport.
  it("reaches a known L2 through its public RPC, or the transport given for it", () => {
    const { transport } = scriptedTransport(noRpc);
    const withPublicRpc = Ensforge.create({ chain: mainnet });
    const withTransport = Ensforge.create({
      chain: mainnet,
      transports: { [base.id]: transport },
    });

    assert.strictEqual(withPublicRpc.client(base.id).transport.url, base.rpcUrls.default.http[0]);
    assert.strictEqual(withPublicRpc.client(base.id).chain?.id, base.id);
    assert.strictEqual(withTransport.client(base.id).transport.key, "custom");
  });

  it("fails with CHAIN_NOT_CONFIGURED for a chain it cannot reach", () => {
    const { ens } = clientOn(mainnet);

    const offline = expectThrow(() => ens.client(base.id), {
      _tag: "ConfigError",
      code: "CHAIN_NOT_CONFIGURED",
    });
    expectThrow(() => Ensforge.create({ chain: mainnet }).client(4663), {
      _tag: "ConfigError",
      code: "CHAIN_NOT_CONFIGURED",
    });

    assert.nestedPropertyVal(offline, "context.chainId", base.id);
  });

  it("fails with CHAIN_NOT_CONFIGURED when the ENS chain has no transport and no public RPC", () => {
    expectThrow(() => Ensforge.create({ chain: mainnet, publicRpc: false }), {
      _tag: "ConfigError",
      code: "CHAIN_NOT_CONFIGURED",
    });
  });

  it("reaches a chain it does not know through the transport given for it", () => {
    const { transport } = scriptedTransport(noRpc);
    const ens = Ensforge.create({ chain: mainnet, transports: { 4663: transport } });

    assert.strictEqual(ens.client(4663).transport.key, "custom");
  });
});

describe("Ensforge.create config", () => {
  it("fills every default", () => {
    const { config } = clientOn().ens;

    assert.deepStrictEqual(config.ccipRead, { gatewayUrls: [] });
    assert.deepStrictEqual(config.batch, { multicall: { batchSize: 16_384, wait: 0 } });
    assert.strictEqual(config.blockTag, "latest");
    assert.strictEqual(config.simulate, true);
    assert.isUndefined(config.indexer);
    assert.isFunction(config.storage.get);
    assert.deepStrictEqual(config.gateways, {
      ipfs: "https://ipfs.io",
      arweave: "https://arweave.net",
      swarm: "https://api.gateway.ethswarm.org",
    });
  });

  it("fills the gateways a client does not set", () => {
    const { config } = clientOn(mainnet, { gateways: { ipfs: "https://gateway.example/" } }).ens;

    assert.deepInclude(config.gateways, {
      ipfs: "https://gateway.example",
      arweave: "https://arweave.net",
    });
  });

  it.each([
    [{ multicall: false }, { multicall: false }],
    [{ multicall: true }, { multicall: { batchSize: 16_384, wait: 0 } }],
    [{ multicall: { wait: 5 } }, { multicall: { batchSize: 16_384, wait: 5 } }],
    [{ multicall: { batchSize: 1024 } }, { multicall: { batchSize: 1024, wait: 0 } }],
    [{}, { multicall: { batchSize: 16_384, wait: 0 } }],
  ] as const)("resolves batch %j to %j", (batch, expected) => {
    assert.deepStrictEqual(clientOn(mainnet, { batch }).ens.config.batch, expected);
  });

  it("freezes the client, its chain and its config", () => {
    const { ens } = clientOn();

    assert.isTrue(Object.isFrozen(ens));
    assert.isTrue(Object.isFrozen(ens.chain));
    assert.isTrue(Object.isFrozen(ens.config));
    assert.throws(() => {
      (ens as { account: unknown }).account = signer.address;
    });
  });
});

describe("Ensforge.create account", () => {
  it("takes a local account's address", () => {
    assert.strictEqual(clientOn(mainnet, { account: signer }).ens.account, signer.address);
  });

  it("takes the wallet's account", () => {
    const { transport } = scriptedTransport(noRpc);
    const wallet = createWalletClient({ chain: mainnet, transport, account: signer });

    assert.strictEqual(clientOn(mainnet, { wallet }).ens.account, signer.address);
  });

  it("prefers the account option over the wallet's account", () => {
    const { transport } = scriptedTransport(noRpc);
    const wallet = createWalletClient({ chain: mainnet, transport, account: signer });
    const account = "0x225f137127d9067788314bc7fcc1f36746a3c3B5";

    assert.strictEqual(clientOn(mainnet, { wallet, account }).ens.account, account);
  });

  it("does not ask a wallet getter for a wallet at creation", () => {
    let reads = 0;
    const { ens } = clientOn(mainnet, {
      wallet: () => {
        reads++;
        return undefined;
      },
    });

    assert.isUndefined(ens.account);
    assert.strictEqual(reads, 0);
  });
});
