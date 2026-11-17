import type { Fixture } from "../fixture.ts";
import { ownershipV1 } from "./ownership-v1.ts";
import { ownershipV2 } from "./ownership-v2.ts";
import { primary } from "./primary.ts";
import { records } from "./records.ts";
import { resolvers } from "./resolvers.ts";
import { wrapper } from "./wrapper.ts";

/** Every fixture, in seeding order. */
export const allFixtures: readonly Fixture[] = [
  ...ownershipV1,
  ...wrapper,
  ...ownershipV2,
  ...resolvers,
  ...records,
  ...primary,
];
