import { Effect } from "effect";

import { toFunctionSelector } from "viem";

import { step, type Step } from "./engine.ts";

const erc1155Received = toFunctionSelector(
  "onERC1155Received(address,address,uint256,uint256,bytes)",
);
const erc1155BatchReceived = toFunctionSelector(
  "onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)",
);

/** The image of `mock.avatarToken`'s tokens. */
export const avatarImage = "https://ensforge.com/nft.png";

/**
 * One instance of each behaviour mock that needs no per-name setup: misbehaving resolvers,
 * registries, wallets, receivers and tokens. Fixtures that need a configured or name-bound mock
 * (`DummyShapeshiftResolver` responses, `TestNameWrapperReentrancy`) deploy their own from the same
 * artifacts.
 */
export const mockSteps: readonly Step[] = [
  step("mocks.resolvers", (c) =>
    Effect.gen(function* () {
      yield* c.deploy("mock.shapeshiftResolver", "mocks/DummyShapeshiftResolver");
      yield* c.deploy("mock.offchainResolver", "mocks/MockOffchainResolver");
      yield* c.deploy("mock.extendedDnsResolver", "mocks/DummyExtendedDNSSECResolver");
      yield* c.deploy("mock.legacyTextResolver", "mocks/DummyLegacyTextResolver");
      yield* c.deploy("mock.nonCcipAwareResolver", "mocks/DummyNonCCIPAwareResolver", [
        yield* c.address("v1.offchainDnsResolver"),
      ]);
      yield* c.deploy("mock.revertingRegistry", "mocks/MockRevertingRegistry");

      // A reverting call (e.g. `supportsInterface`, `owner()`), a gas burner and a returndata bomb.
      for (const [key, mode] of [
        ["mock.hostile.revert", 0],
        ["mock.hostile.burnGas", 1],
        ["mock.hostile.returnLarge", 2],
      ] as const) {
        yield* c.deploy(key, "mocks/HostileContract");
        if (mode !== 0) yield* c.write(key, "setMode", [mode]);
      }

      // A resolver that keeps its records off-chain and refuses writes; tests pick the mode.
      yield* c.deploy("mock.offchainWriter", "mocks/OffchainWriteResolver");

      // A token for NFT avatars, whose metadata is a `data:` URL with an image.
      yield* c.deploy("mock.avatarToken", "mocks/AvatarToken");
      yield* c.write("mock.avatarToken", "setMetadata", [
        `data:application/json;base64,${Buffer.from(JSON.stringify({ image: avatarImage })).toString("base64")}`,
      ]);
    }),
  ),

  step("mocks.accounts", (c) =>
    Effect.gen(function* () {
      yield* c.deploy("mock.smartContractWallet", "mocks/MockSmartContractWallet", [
        c.accounts.user,
      ]);
      yield* c.deploy("mock.erc6492WalletFactory", "mocks/MockERC6492WalletFactory");
      yield* c.deploy("mock.ownable", "mocks/MockOwnable", [c.accounts.user]);
      yield* c.deploy("mock.erc1155Receiver", "mocks/ERC1155ReceiverMock", [
        erc1155Received,
        false,
        erc1155BatchReceived,
        false,
      ]);
      yield* c.deploy("mock.erc1155Rejecter", "mocks/ERC1155ReceiverMock", [
        erc1155Received,
        true,
        erc1155BatchReceived,
        true,
      ]);
      yield* c.deploy("mock.nameGriefer", "mocks/NameGriefer", [
        yield* c.address("v1.nameWrapper"),
      ]);
    }),
  ),

  step("mocks.tokens", (c) =>
    Effect.gen(function* () {
      yield* c.deploy("mock.blacklistToken", "mocks/MockERC20Blacklist");
      yield* c.deploy("mock.voidReturnToken", "mocks/MockERC20VoidReturn");
      yield* c.deploy("mock.falseReturnToken", "mocks/MockERC20FalseReturn");
    }),
  ),
];

/**
 * L2 primary names, deployed after everything else so no other address moves: OP Mainnet's L2
 * reverse registrar (tests copy its code to a second anvil answering as OP Mainnet) and a
 * resolver that answers through a gateway (tests serve `8000000a.reverse` from that anvil).
 */
export const l2MockSteps: readonly Step[] = [
  step("mocks.l2", (c) =>
    Effect.gen(function* () {
      // OP Mainnet's ENSIP-11 coin type, the registrar's constructor argument there.
      yield* c.deploy("mock.l2ReverseRegistrar", "v1/L2ReverseRegistrar", [0x8000000an]);
      yield* c.deploy("mock.gatewayResolver", "mocks/GatewayResolver");
    }),
  ),
];
