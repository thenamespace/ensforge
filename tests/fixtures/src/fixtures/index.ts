import type { Fixture } from "../fixture.ts";
import { ownershipV1 } from "./ownership-v1.ts";
import { ownershipV2 } from "./ownership-v2.ts";
import { wrapper } from "./wrapper.ts";

/** Every fixture, in seeding order. */
export const allFixtures: readonly Fixture[] = [...ownershipV1, ...wrapper, ...ownershipV2];
