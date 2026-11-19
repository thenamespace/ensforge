import type { Fixture } from "../fixture.ts";
import { accounts } from "./accounts.ts";
import { dns } from "./dns.ts";
import { hierarchy } from "./hierarchy.ts";
import { migration } from "./migration.ts";
import { namespaceNames } from "./namespace-names.ts";
import { namespaceParents } from "./namespace-parents.ts";
import { ownershipV1 } from "./ownership-v1.ts";
import { ownershipV2 } from "./ownership-v2.ts";
import { primary } from "./primary.ts";
import { records } from "./records.ts";
import { registration } from "./registration.ts";
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
  ...hierarchy,
  ...dns,
  ...registration,
  ...migration,
  ...accounts,
  ...namespaceParents,
  ...namespaceNames,
];
