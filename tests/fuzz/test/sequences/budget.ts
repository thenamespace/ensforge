// The budget names the tests, so it is read when the file loads, outside any Effect.
/* oxlint-disable effecttsgo/process-env, effecttsgo/global-random */
// Release CI runs the default budget; manual campaigns raise it, e.g.
// `ENSFORGE_FUZZ_RUNS=5000 ENSFORGE_FUZZ_SEED=random pnpm test:fuzz`.
const configured = process.env["ENSFORGE_FUZZ_SEED"];

export const seed =
  configured === "random" ? Math.floor(Math.random() * 2 ** 31) : Number(configured ?? 20_261_117);
export const runs = Number(process.env["ENSFORGE_FUZZ_RUNS"] ?? 100);
export const maxLength = Number(process.env["ENSFORGE_FUZZ_LENGTH"] ?? 30);
