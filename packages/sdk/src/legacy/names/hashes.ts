import { Schema } from "effect";

import { labelhash as viemLabelhash, namehash as viemNamehash } from "viem/ens";

import {
  Labelhash,
  type Labelhash as LabelhashValue,
  Namehash,
  type Namehash as NamehashValue,
} from "../schemas/hash.js";
import type {
  NormalizedLabel as NormalizedLabelValue,
  NormalizedName as NormalizedNameValue,
} from "../schemas/name.js";
import { normalizeLabel, normalizeName } from "./normalize.js";

export const namehash = (name: string | NormalizedNameValue): NamehashValue =>
  Schema.decodeSync(Namehash)(viemNamehash(normalizeName(name)));

export const labelhash = (label: string | NormalizedLabelValue): LabelhashValue =>
  Schema.decodeSync(Labelhash)(viemLabelhash(normalizeLabel(label)));
