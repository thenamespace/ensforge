// Runs before every test file of the fast lanes: fixed property seeds and no network.
import { beforeEach } from "@effect/vitest";
import { Arbitrary } from "effect";

Arbitrary.configureGlobal({
  check: {
    seed: Number(process.env.ENSFORGE_TEST_SEED ?? 20261117),
    runs: Number(process.env.ENSFORGE_TEST_RUNS ?? 200),
  },
});

beforeEach(() => {
  globalThis.fetch = (() => {
    throw new Error(
      "Network access is not allowed in this lane (fetch); use a scripted transport.",
    );
  }) as typeof fetch;
});
