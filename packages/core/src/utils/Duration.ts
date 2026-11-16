import { InvalidInputError } from "../errors/classes/InvalidInputError.js";

const secondsPerDay = 86_400n;
// ENS registrars price and extend in 365-day years.
const secondsPerYear = 365n * secondsPerDay;

const count = (value: number | bigint): bigint => {
  if (typeof value === "bigint" ? value < 0n : !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidInputError({ code: "INVALID_DURATION", input: value });
  }
  return BigInt(value);
};

/**
 * `n` days in seconds.
 *
 * @throws `Errors.InvalidInputError` (`INVALID_DURATION`) for negative or fractional values.
 * @category durations
 * @since 1.0.0
 */
export const days = (n: number | bigint): bigint => count(n) * secondsPerDay;

/**
 * `n` 365-day years in seconds, as ENS registrars count them.
 *
 * **Example** (A one-year registration)
 *
 * ```ts
 * import { Duration } from "@ensforge/core"
 *
 * await ens.registration.register({ name: "alice.eth", duration: Duration.years(1) })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_DURATION`) for negative or fractional values.
 * @category durations
 * @since 1.0.0
 */
export const years = (n: number | bigint): bigint => count(n) * secondsPerYear;
