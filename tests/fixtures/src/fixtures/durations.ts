import { clockJump } from "../fixture.ts";

const day = 86_400n;

/**
 * Registration durations chosen so that, after the build's single clock jump (`clockJump`, 400
 * days), each name lands in the state its fixture describes. Seeding itself moves the clock by
 * minutes, far inside every margin.
 */
export const durations = {
  /** Still registered after the jump. */
  active: 5n * 365n * day,
  /** ENSv1: expired 30 days before the jump, inside the 90-day grace period. */
  v1Grace: clockJump - 30n * day,
  /** ENSv1: grace ended 10 days before the jump, inside the 21-day premium. */
  v1Premium: clockJump - 100n * day,
  /** ENSv2: expired 14 days before the jump, inside the 28-day grace period. */
  v2Grace: clockJump - 14n * day,
  /** ENSv2: grace ended 10 days before the jump, inside the 21-day premium. */
  v2Premium: clockJump - 38n * day,
  /** The shortest registration: long expired after the jump, grace and premium included. */
  expired: 28n * day,
};

export const days = (count: bigint): bigint => count * day;
