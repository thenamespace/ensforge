import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, String as Str } from "effect";

import { actionPage, actionUrl } from "@ensforge/tools/internal/docs/actionPages";
import { errorCodePage } from "@ensforge/tools/internal/docs/errorPages";
import type { Member } from "@ensforge/tools/internal/docs/members";
import type { ActionDoc } from "@ensforge/tools/internal/docs/model";
import { sectionsOf } from "@ensforge/tools/internal/docs/sections";

const member = (name: string, type: string, extra: Partial<Member> = {}): Member => ({
  name,
  type,
  optional: false,
  defaultValue: undefined,
  description: "",
  namespace: undefined,
  file: "/repo/packages/sdk/src/actions/record/set/index.ts",
  ...extra,
});

const doc = (examples: readonly string[], tags: readonly string[]) =>
  sectionsOf(
    Arr.join(
      [
        "Writes records of an ENS name.",
        "",
        "**When to use**",
        "",
        "Use to update a profile.",
        ...Arr.flatMap(examples, (example, index) => [
          "",
          `**Example** (Example ${index + 1})`,
          "",
          "```ts",
          example,
          "```",
        ]),
        "",
        ...tags,
      ],
      "\n",
    ),
  );

const write: ActionDoc = {
  root: "sdk",
  domain: "record",
  folder: "set",
  name: "set",
  kind: "write",
  batchable: false,
  doc: doc(
    [
      "await ens.record.set({ name })",
      'import { Actions } from "@ensforge/sdk"\nawait Actions.record.set(ens, { name })',
      'import { Actions } from "@ensforge/sdk/effect"\nyield* Actions.record.set(ens, { name })',
    ],
    [
      "@throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`) when the account may not edit records.",
      "@see {@link Actions.record.get} to read records",
      "@stability stable",
      "@since 1.0.0",
    ],
  ),
  options: {
    variants: [
      [
        member("name", "string", { description: "ENS name to update." }),
        member("texts", "Readonly<Record<string, string | null>>", { optional: true }),
      ],
    ],
    shared: ["Write"],
  },
  returns: {
    type: "Write.Result",
    description: "Submitted hashes.",
    members: [member("hash", "Hex")],
  },
  planMethods: [{ name: "prepare", description: "Builds the plan without sending anything." }],
  sync: {
    name: "setSync",
    doc: doc(["await ens.record.setSync({ name })"], []),
    returns: { type: "Write.SyncResult", description: "", members: [] },
  },
};

const links = {
  resolve: (target: string) =>
    target === "Actions.record.get" ? actionUrl("sdk", "record", "get") : undefined,
  hookOf: (path: string) =>
    path === "record.set"
      ? { name: "useSetRecords", url: "/docs/react/reference/hooks/use-set-records" }
      : undefined,
};

describe("actionPage", () => {
  const page = actionPage(write, links);
  const has = (text: string) => assert.isTrue(Str.includes(text)(page), `missing: ${text}`);

  it("titles the page by the action path, with its badges", () => {
    has('title: "record.set"');
    has("**Write** · Stable · Since 1.0.0");
  });

  it("puts each example in the tab of how it calls the action", () => {
    const tabs = Str.split(page, "<Tab>").slice(1, 4);
    assert.isTrue(Str.includes("ens.record.set")(tabs[0] ?? ""));
    assert.isTrue(Str.includes('from "@ensforge/sdk"')(tabs[1] ?? ""));
    assert.isTrue(Str.includes('from "@ensforge/sdk/effect"')(tabs[2] ?? ""));
    has('<Tabs groupId="api" items={["Client","Standalone","Effect"]} persist>');
  });

  it("documents options, returns, errors, plan methods and the Sync form", () => {
    has("| `name` (required) | `string` |  | ENS name to update. |");
    has("| `texts` | `Readonly<Record<string, string \\| null>>` |  |  |");
    has("Also takes the [write options](/docs/sdk/reference/client#write-options).");
    has("Resolves to `Write.Result`. Submitted hashes.");
    has(
      "[`NOT_OWNER`](/docs/sdk/errors/NOT_OWNER), [`MISSING_ROLES`](/docs/sdk/errors/MISSING_ROLES)",
    );
    has("`Errors.WriteError`");
    has("| `record.set.prepare(options)` | Builds the plan without sending anything. |");
    has("## Wait for the receipt with `setSync`");
    has("In React, use [`useSetRecords`](/docs/react/reference/hooks/use-set-records).");
    has("- [`record.get`](/docs/sdk/reference/actions/record/get) to read records");
  });
});

describe("errorCodePage", () => {
  it("shows the developer and user copy, retry safety and the actions that name the code", () => {
    const page = errorCodePage(
      {
        code: "NOT_OWNER",
        errorClass: "UnauthorizedError",
        root: "sdk",
        shortMessage: "The account does not own the name.",
        hint: undefined,
        retryable: false,
        user: { title: "Not allowed", message: "You do not own this name." },
      },
      { name: "UnauthorizedError", root: "sdk", summary: "", fields: [], codes: [] },
      [{ path: "record.set", url: actionUrl("sdk", "record", "set"), when: "when not the owner." }],
      () => undefined,
    );
    const has = (text: string) => assert.isTrue(Str.includes(text)(page), `missing: ${text}`);

    has('title: "NOT_OWNER"');
    has("The account does not own the name.");
    has("| Not allowed | You do not own this name. |  |");
    has("`retryable: false`");
    has("| [`record.set`](/docs/sdk/reference/actions/record/set) | when not the owner. |");
    has('`Errors.hasCode("NOT_OWNER")`');
    assert.isFalse(Str.includes("## How to fix")(page), "no hint, no fix section");
  });
});
