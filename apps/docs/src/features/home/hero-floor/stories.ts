import { avatarSrc } from "../avatars";
import type { Accent } from "./layout";

/**
 * The stories the hero's cards tell, one at a time. Each is four real steps in ensforge for one
 * name, in order, and every card in a story refers to that name. Names, addresses and records
 * were read from Ethereum mainnet; each lifecycle name is also the primary name of its address,
 * and nick.eth reads as migrated to ENSv2.
 */

export interface StoryCard {
  /** Short label in the card's header. */
  readonly label: string;
  readonly accent: Accent;
  readonly name: string;
  readonly avatar: string | undefined;
  /** Key and value rows under the name. */
  readonly rows: readonly (readonly [key: string, value: string])[];
  readonly footer?: string;
  /** Shows the ENSv1 → ENSv2 badge row. */
  readonly migrated?: boolean;
}

export interface Story {
  readonly id: string;
  readonly cards: readonly [StoryCard, StoryCard, StoryCard, StoryCard];
}

const card = (
  label: string,
  accent: Accent,
  name: string,
  rows: StoryCard["rows"],
  footer?: string,
  options: { readonly avatar?: boolean; readonly migrated?: boolean } = {},
): StoryCard => ({
  label,
  accent,
  name,
  avatar: options.avatar ? avatarSrc(name) : undefined,
  rows,
  ...(footer ? { footer } : {}),
  ...(options.migrated ? { migrated: true } : {}),
});

/** Register a name, set its records in one batch, set it as primary, read it back. */
const lifecycle = (
  name: string,
  address: string,
  records: readonly (readonly [string, string])[],
): Story => ({
  id: `lifecycle-${name}`,
  cards: [
    card(
      "register",
      "green",
      name,
      [
        ["duration", "1 year"],
        ["price", "$5 / year"],
      ],
      "commit, then register",
    ),
    card(
      "records · hca batch",
      "magenta",
      name,
      [
        ...records.map(([key, value]): readonly [string, string] => [`setText ${key}`, value]),
        ["setAddr eth", address],
      ],
      `${records.length + 1} writes · 1 signature`,
    ),
    card("primary name", "sky", name, [[address, "⇄ verified"]], "resolves both ways", {
      avatar: true,
    }),
    card("profile", "blue", name, [["addr", address], ...records], undefined, { avatar: true }),
  ],
});

export const stories: readonly Story[] = [
  lifecycle("envoy1084.eth", "0xc0d8…1FE6", [
    ["url", "envoy1084.xyz"],
    ["com.github", "envoy1084"],
  ]),
  {
    id: "subname-jesse.base.eth",
    cards: [
      card("parent", "blue", "base.eth", [["addr", "0x1453…E056"]], "a name with subnames"),
      card(
        "subname",
        "green",
        "jesse.base.eth",
        [["parent", "base.eth"]],
        "issued under base.eth",
        {
          avatar: true,
        },
      ),
      card("resolve", "sky", "jesse.base.eth", [["addr", "0x2211…7DA9"]], "one call, any depth", {
        avatar: true,
      }),
      card(
        "profile",
        "blue",
        "jesse.base.eth",
        [
          ["com.github", "jessepollak"],
          ["url", "jesse.xyz"],
        ],
        undefined,
        { avatar: true },
      ),
    ],
  },
  lifecycle("cap.eth", "0x035e…17D3", [
    ["url", "namespace.ninja"],
    ["com.github", "thecaphimself"],
  ]),
  {
    id: "migration-nick.eth",
    cards: [
      card("ensv1 name", "blue", "nick.eth", [["registry", "ENSv1"]], "before migration", {
        avatar: true,
      }),
      card("migrate", "blue", "nick.eth", [], "v2-migrated", { avatar: true, migrated: true }),
      card("resolve", "sky", "nick.eth", [["addr", "0xb8c2…67d5"]], "same answer after migrating", {
        avatar: true,
      }),
      card(
        "profile",
        "blue",
        "nick.eth",
        [
          ["com.github", "arachnid"],
          ["com.twitter", "nicksdjohnson"],
        ],
        undefined,
        { avatar: true },
      ),
    ],
  },
  lifecycle("artii.eth", "0x1D84…19f8", [
    ["url", "app.namespace.ninja"],
    ["com.github", "nenadmitt"],
  ]),
  lifecycle("maxi.eth", "0xc9E6…e2c8", [["com.twitter", "maxidoteth"]]),
];

/** Phones show two steps of the lifecycle stories: the primary name and the profile. */
export const phoneStories = stories.filter((story) => story.id.startsWith("lifecycle-"));

/** How long each story stays before the cards cross-fade to the next. */
export const STORY_MS = 9000;
