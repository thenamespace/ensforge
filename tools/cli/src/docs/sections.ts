import { Array as Arr, Option, String as Str } from "effect";

import { exampleHeading, sectionHeadings } from "../lint-jsdoc/actions.ts";

/** A titled example of a doc comment, with its fence language. */
export type DocExample = {
  readonly title: string;
  readonly language: string;
  readonly code: string;
};

/** One `@tag value` of a doc comment; continuation lines are joined with spaces. */
export type DocTag = { readonly tag: string; readonly value: string };

/** A doc comment split along the section grammar `lint-jsdoc` enforces on actions. */
export type DocSections = {
  /** Paragraphs before the first section heading. */
  readonly summary: string;
  readonly whenToUse: string;
  readonly details: string;
  readonly gotchas: string;
  readonly examples: readonly DocExample[];
  readonly tags: readonly DocTag[];
};

type Prose = "summary" | "whenToUse" | "details" | "gotchas";

// The section each heading of `sectionHeadings` opens, in its order.
const proseOf = new Map<string, Prose>(
  Arr.zip(sectionHeadings, ["whenToUse", "details", "gotchas"] as const),
);

/**
 * Splits the text of a doc comment (`jsdocText`) into its summary, `**When to use**`,
 * `**Details**`, `**Gotchas**` and `**Example** (Title)` sections and its tags. Fenced code in
 * prose stays in the prose; the fence of an example becomes its code.
 */
export const sectionsOf = (text: string): DocSections => {
  const prose: Record<Prose, string[]> = { summary: [], whenToUse: [], details: [], gotchas: [] };
  const examples: { title: string; language: string; code: string[] }[] = [];
  const tags: { tag: string; value: string }[] = [];

  let target: string[] = prose.summary;
  let example: { title: string; language: string; code: string[] } | undefined;
  let fence: "prose" | "example" | undefined;
  let tag: { tag: string; value: string } | undefined;

  for (const line of Str.split(text, "\n")) {
    const trimmed = Str.trim(line);

    if (fence !== undefined) {
      const closing = trimmed === "```";
      if (fence === "prose" || !closing) target.push(line);
      if (closing) fence = undefined;
      continue;
    }

    const tagStart = /^@(\w+)\s*(.*)$/.exec(trimmed);
    if (tagStart !== null) {
      tag = { tag: tagStart[1] ?? "", value: tagStart[2] ?? "" };
      tags.push(tag);
      continue;
    }
    if (tag !== undefined) {
      if (trimmed !== "") tag.value = `${tag.value} ${trimmed}`;
      continue;
    }

    const heading = exampleHeading.exec(trimmed);
    if (heading !== null) {
      example = { title: heading[1] ?? "", language: "ts", code: [] };
      examples.push(example);
      target = [];
      continue;
    }
    const section = proseOf.get(trimmed);
    if (section !== undefined) {
      example = undefined;
      target = prose[section];
      continue;
    }

    if (Str.startsWith("```")(trimmed)) {
      if (example !== undefined && example.code.length === 0) {
        example.language = Str.slice(3)(trimmed) || "ts";
        target = example.code;
        fence = "example";
        continue;
      }
      fence = "prose";
    }
    target.push(line);
  }

  return {
    summary: Str.trim(Arr.join(prose.summary, "\n")),
    whenToUse: Str.trim(Arr.join(prose.whenToUse, "\n")),
    details: Str.trim(Arr.join(prose.details, "\n")),
    gotchas: Str.trim(Arr.join(prose.gotchas, "\n")),
    examples: Arr.map(examples, ({ title, language, code }) => ({
      title,
      language,
      code: Str.trimEnd(Arr.join(code, "\n")),
    })),
    tags,
  };
};

/** The value of the first `@tag`, if any. */
export const tagValue = (sections: DocSections, tag: string): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Arr.findFirst(sections.tags, (entry) => entry.tag === tag),
      (entry) => entry.value,
    ),
  );

/** The values of every `@tag`. */
export const tagValues = (sections: DocSections, tag: string): readonly string[] =>
  Arr.map(
    Arr.filter(sections.tags, (entry) => entry.tag === tag),
    (entry) => entry.value,
  );

/** One `@throws` line: the error class, the codes it names and the condition. */
export type Throws = {
  readonly errorClass: string;
  readonly codes: readonly string[];
  readonly when: string;
};

/**
 * Parses the `@throws` grammar `lint-jsdoc` enforces: `` `Errors.X` (`CODE_A`, `CODE_B`) when … ``.
 * The codes are the parenthesized group right after the class; the rest is the condition.
 */
export const throwsOf = (value: string): Throws => {
  const match = /^`(?:Errors\.)?(\w+)`\s*(?:\(([^)]*)\))?\s*(.*)$/s.exec(Str.trim(value));
  if (match === null) return { errorClass: "", codes: [], when: Str.trim(value) };
  return {
    errorClass: match[1] ?? "",
    codes: Arr.map(
      [...Str.matchAll(/`([A-Z][A-Z0-9_]+)`/g)(match[2] ?? "")],
      ([, code]) => code ?? "",
    ),
    when: Str.trim(match[3] ?? ""),
  };
};
