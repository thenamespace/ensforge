import { describe } from "@effect/vitest";
import { Effect } from "effect";

import { Devnet } from "@ensforge/test-devnet";
import { Fixtures } from "@ensforge/test-fixtures";
import { expectRejection, type ExpectedError } from "@ensforge/test-harness";

import { ensforge, onProfile } from "../support/chain.ts";

// The documented errors of reads that only chain state can produce.

const year = 31_536_000n;
const stranger = "0x000000000000000000000000000000000000dEaD";

const fails = (read: () => Promise<unknown>, expected: ExpectedError) =>
  Effect.asVoid(expectRejection(read, expected));

describe("read errors", () => {
  onProfile("v1-live")("v1-live", (it) => {
    it.effect("strict reads of a name without a resolver", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const ens = ensforge(yield* Devnet);
        const name = fixtures.byId("resolver.none").name;
        const noResolver: ExpectedError = { _tag: "NotFoundError", code: "RESOLVER_NOT_FOUND" };

        yield* fails(() => ens.record.getText({ name, key: "url", strict: true }), noResolver);
        yield* fails(() => ens.record.getAddress({ name, strict: true }), noResolver);
        yield* fails(() => ens.record.getContentHash({ name, strict: true }), noResolver);
        yield* fails(() => ens.record.getAvatar({ name, strict: true }), noResolver);
        yield* fails(() => ens.approval.getDelegate({ name, delegate: accounts.bob }), noResolver);
        yield* fails(
          () => ens.role.get({ account: accounts.alice, target: "resolver", name, root: true }),
          noResolver,
        );
      }),
    );

    it.effect("history scans past their request budget", () =>
      Effect.gen(function* () {
        const ens = ensforge(yield* Devnet);
        yield* fails(() => ens.event.get({ name: "v1-plain.eth", fromBlock: 0n, maxRequests: 0 }), {
          _tag: "NetworkError",
          code: "LOG_RANGE_TOO_LARGE",
        });
      }),
    );

    it.effect("strict primary names that are missing or do not match", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const ens = ensforge(yield* Devnet);
        const mismatched = String(fixtures.byId("primary.mismatch").facts["address"]);

        yield* fails(() => ens.primaryName.get({ address: stranger, strict: true }), {
          _tag: "NotFoundError",
          code: "PRIMARY_NAME_NOT_SET",
        });
        yield* fails(() => ens.primaryName.get({ address: mismatched, strict: true }), {
          _tag: "NotFoundError",
          code: "PRIMARY_NAME_MISMATCH",
        });
      }),
    );

    it.effect("ENSv2 roles on ENSv1 contracts, and record keys that are not coins", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const { accounts } = yield* Devnet;
        const ens = ensforge(yield* Devnet);
        const name = fixtures.byId("records.v1").name;

        yield* fails(() => ens.role.get({ account: accounts.alice, target: "registry", name }), {
          _tag: "UnsupportedError",
          code: "UNSUPPORTED_PROTOCOL",
        });
        yield* fails(
          () =>
            ens.permission.check({
              name,
              operation: { setRecord: "address", key: "nope" },
              account: accounts.alice,
            }),
          { _tag: "InvalidInputError", code: "INVALID_COIN_TYPE" },
        );
      }),
    );
  });

  onProfile("mainnet-shaped")("mainnet-shaped", (it) => {
    it.effect("prices with tokens and durations the registrar does not accept", () =>
      Effect.gen(function* () {
        const ens = ensforge(yield* Devnet);
        const name = "qqqqq.eth";

        for (const paymentToken of ["0x1234", stranger]) {
          const expected: ExpectedError =
            paymentToken === stranger
              ? { _tag: "UnsupportedError", code: "PAYMENT_TOKEN_UNSUPPORTED" }
              : { _tag: "InvalidInputError", code: "INVALID_ADDRESS" };
          yield* fails(
            () => ens.registration.getPrice({ name, duration: year, paymentToken }),
            expected,
          );
          yield* fails(
            () =>
              ens.registration.getRenewalPrice({
                names: "v2-plain.eth",
                duration: year,
                paymentToken,
              }),
            expected,
          );
        }
        yield* fails(() => ens.registration.getPrice({ name, duration: 86_400n }), {
          _tag: "InvalidInputError",
          code: "DURATION_TOO_SHORT",
        });
      }),
    );

    it.effect("strict reads of registries, links and token approvals that do not exist", () =>
      Effect.gen(function* () {
        const fixtures = yield* Fixtures;
        const ens = ensforge(yield* Devnet);

        yield* fails(
          () => ens.registry.get({ name: fixtures.byId("v2.registered").name, strict: true }),
          {
            _tag: "NotFoundError",
            code: "REGISTRY_NOT_FOUND",
          },
        );
        yield* fails(
          () =>
            ens.resolver.getLink({ name: fixtures.byId("records.v2.default").name, strict: true }),
          { _tag: "NotFoundError", code: "RECORD_NOT_FOUND" },
        );
        yield* fails(() => ens.approval.getToken({ name: fixtures.byId("v2.registered").name }), {
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
        const ens = ensforge(yield* Devnet);
        const name = fixtures.byId("resolver.offchain").name;
        const failed: ExpectedError = { _tag: "GatewayError", code: "GATEWAY_REQUEST_FAILED" };

        yield* fails(() => ens.record.getText({ name, key: "url" }), failed);
        yield* fails(() => ens.record.getAddress({ name }), failed);
        yield* fails(() => ens.record.get({ name, texts: ["url"], addresses: ["eth"] }), failed);
      }),
    );
  });

  onProfile("v2-only")("v2-only", (it) => {
    it.effect("NameWrapper reads where ENSv1 is not deployed", () =>
      Effect.gen(function* () {
        const ens = ensforge(yield* Devnet);
        yield* fails(() => ens.wrapper.getFuses({ name: "v2-plain.eth" }), {
          _tag: "UnsupportedError",
          code: "UNSUPPORTED_ON_DEPLOYMENT",
        });
      }),
    );
  });
});
