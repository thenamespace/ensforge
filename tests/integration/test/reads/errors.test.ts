import { assert, describe } from "@effect/vitest";
import { Effect } from "effect";

import { Deployments } from "@ensforge/contracts";
import { Duration, Ensforge, ensActions } from "@ensforge/sdk";
import { Actions } from "@ensforge/sdk/effect";
import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectFailure } from "@ensforge/test-harness";
import { http } from "viem";

import { Clients } from "../support/clients.ts";
import { onProfile } from "../support/lane.ts";

// The documented errors of reads that only chain state can produce.

describe("read errors", () => {
  onProfile("v1-live")("v1-live", (it) => {
    it.effect("strict reads of a name without a resolver", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const { reader } = yield* Clients;
        const name = fixtures.byId("resolver.none").name;
        const noResolver = { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" } as const;

        yield* expectFailure(
          Actions.record.getText(reader, { name, key: "url", strict: true }),
          noResolver,
        );
        yield* expectFailure(Actions.record.getAddress(reader, { name, strict: true }), noResolver);
        yield* expectFailure(
          Actions.record.getContentHash(reader, { name, strict: true }),
          noResolver,
        );
        yield* expectFailure(Actions.record.getAvatar(reader, { name, strict: true }), noResolver);
        yield* expectFailure(
          Actions.approval.getDelegate(reader, { name, delegate: accounts.bob }),
          noResolver,
        );
        yield* expectFailure(
          Actions.role.get(reader, {
            account: accounts.alice,
            target: "resolver",
            name,
            root: true,
          }),
          noResolver,
        );
      }),
    );

    // The resolver answers only the legacy `addr(bytes32)`, with an OffchainLookup another
    // contract sent; that is the failure to report, not the missing ENSIP-9 profile. Batched
    // with the ENSIP-9 the Universal Resolver hands it to the batch gateway, which fails.
    it.effect("address reads report a spoofed lookup behind a missing profile", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { reader } = yield* Clients;
        const name = fixtures.byId("resolver.spoofed-offchain-lookup").name;

        yield* expectFailure(Actions.record.getAddress(reader, { name }), {
          _tag: "GatewayError",
          code: "GATEWAY_REQUEST_FAILED",
        });
      }),
    );

    it.effect("history scans past their request budget", () =>
      Effect.gen(function* () {
        const { reader } = yield* Clients;

        yield* expectFailure(
          Actions.event.get(reader, { name: "v1-plain.eth", fromBlock: 0n, maxRequests: 0 }),
          { _tag: "NetworkError", code: "LOG_RANGE_TOO_LARGE" },
        );
      }),
    );

    it.effect("strict primary names that are missing or do not match", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { reader } = yield* Clients;
        const mismatched = String(fixtures.byId("primary.mismatch").facts["address"]);

        yield* expectFailure(
          Actions.primaryName.get(reader, {
            address: "0x000000000000000000000000000000000000dEaD",
            strict: true,
          }),
          { _tag: "NotFoundError", code: "PRIMARY_NAME_NOT_SET" },
        );
        yield* expectFailure(
          Actions.primaryName.get(reader, { address: mismatched, strict: true }),
          {
            _tag: "NotFoundError",
            code: "PRIMARY_NAME_MISMATCH",
          },
        );
      }),
    );

    it.effect("ENSv2 roles on ENSv1 contracts, and record keys that are not coins", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const { reader } = yield* Clients;
        const name = fixtures.byId("records.v1").name;

        yield* expectFailure(
          Actions.role.get(reader, { account: accounts.alice, target: "registry", name }),
          { _tag: "UnsupportedError", code: "UNSUPPORTED_PROTOCOL" },
        );
        yield* expectFailure(
          Actions.permission.check(reader, {
            name,
            operation: { setRecord: "address", key: "nope" },
            account: accounts.alice,
          }),
          { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" },
        );
      }),
    );

    // A client configured with ENSv2 reading a block from before ENSv2 was deployed: mainnet's
    // ENSv2 addresses have no code on this chain.
    it.effect(
      "reads before ENSv2 was deployed take the ENSv1 path or fail typed",
      () =>
        Effect.gen(function* () {
          const devnet = yield* Devnet;
          const ens = Ensforge.create({
            chain: devnet.chain,
            transports: { [devnet.chain.id]: http(devnet.rpcUrl) },
            publicRpc: false,
            deployment: {
              ...devnet.deployments,
              v2: { ...Deployments.mainnet.v2, chainId: devnet.chain.id },
            },
          }).extend(ensActions());
          const notDeployed = { _tag: "ConfigError", code: "CONTRACT_NOT_DEPLOYED" } as const;

          assert.strictEqual(
            (yield* Actions.name.get(ens, { name: "v1-plain.eth" })).kind,
            "v1-unwrapped",
          );
          // The Universal Resolver answers no data at all; not a failure to decode it.
          yield* expectFailure(
            Actions.record.getText(ens, { name: "v1-plain.eth", key: "url" }),
            notDeployed,
          );
          yield* expectFailure(
            Actions.primaryName.get(ens, { address: devnet.accounts.alice }),
            notDeployed,
          );
        }),
      { meta: { cases: ["T11"] } },
    );
  });

  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("prices with tokens and durations the registrar does not accept", () =>
      Effect.gen(function* () {
        const { reader } = yield* Clients;
        const name = "qqqqq.eth";
        const duration = Duration.years(1);

        for (const [paymentToken, expected] of [
          ["0x1234", { _tag: "InvalidInputError", code: "INVALID_ADDRESS" }],
          [
            "0x000000000000000000000000000000000000dEaD",
            { _tag: "UnsupportedError", code: "PAYMENT_TOKEN_UNSUPPORTED" },
          ],
        ] as const) {
          yield* expectFailure(
            Actions.registration.getPrice(reader, { name, duration, paymentToken }),
            expected,
          );
          yield* expectFailure(
            Actions.registration.getRenewalPrice(reader, {
              names: "v2-plain.eth",
              duration,
              paymentToken,
            }),
            expected,
          );
        }
        yield* expectFailure(
          Actions.registration.getPrice(reader, { name, duration: Duration.days(1) }),
          { _tag: "InvalidInputError", code: "DURATION_TOO_SHORT" },
        );
      }),
    );

    it.effect("strict reads of registries, links and token approvals that do not exist", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { reader } = yield* Clients;
        const registered = fixtures.byId("v2.registered").name;

        yield* expectFailure(Actions.registry.get(reader, { name: registered, strict: true }), {
          _tag: "NotFoundError",
          code: "REGISTRY_NOT_FOUND",
        });
        yield* expectFailure(
          Actions.resolver.getLink(reader, {
            name: fixtures.byId("records.v2.default").name,
            strict: true,
          }),
          { _tag: "NotFoundError", code: "RECORD_NOT_FOUND" },
        );
        yield* expectFailure(Actions.approval.getToken(reader, { name: registered }), {
          _tag: "UnsupportedError",
          code: "UNSUPPORTED_PROTOCOL",
        });
      }),
    );

    // The fixture's gateway cannot be reached here. An address read asks two calls in one
    // request; their failure must surface like a text read's single call does.
    it.effect("gateway failures fail address and text reads alike", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { reader } = yield* Clients;
        const name = fixtures.byId("resolver.offchain").name;
        const failed = { _tag: "GatewayError", code: "GATEWAY_REQUEST_FAILED" } as const;

        yield* expectFailure(Actions.record.getText(reader, { name, key: "url" }), failed);
        yield* expectFailure(Actions.record.getAddress(reader, { name }), failed);
        yield* expectFailure(
          Actions.record.get(reader, { name, texts: ["url"], addresses: ["eth"] }),
          failed,
        );
      }),
    );
  });

  onProfile("v2-only")("v2-only", (it) => {
    it.effect(
      "NameWrapper reads where ENSv1 is not deployed",
      () =>
        Effect.gen(function* () {
          const { reader } = yield* Clients;

          yield* expectFailure(Actions.wrapper.getFuses(reader, { name: "v2-plain.eth" }), {
            _tag: "UnsupportedError",
            code: "UNSUPPORTED_ON_DEPLOYMENT",
          });
        }),
      { meta: { cases: ["M:F9"] } },
    );
  });
});
