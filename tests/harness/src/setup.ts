import { beforeEach } from "@effect/vitest";
// Runs before every test file of the fast lanes: fixed property seeds and no network.
import { Arbitrary } from "effect";

const seed = Number(process.env.ENSFORGE_TEST_SEED ?? 20261117);
const runs = Number(process.env.ENSFORGE_TEST_RUNS ?? 200);

Arbitrary.configureGlobal({ check: { seed, runs } });

const blocked = (what: string) => () => {
  throw new Error(
    `Network access is not allowed in this lane (${what}); use a scripted transport.`,
  );
};

beforeEach(() => {
  globalThis.fetch = blocked("fetch") as typeof fetch;
});
