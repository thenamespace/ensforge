import { assert, describe, it } from "@effect/vitest";
import { Array as Arr, Option, Order, String as Str } from "effect";

import { actionPage, domainPage } from "@ensforge/tools/internal/docs/actionPages";
import { errorClassPage, errorCodePage } from "@ensforge/tools/internal/docs/errorPages";
import type { Member } from "@ensforge/tools/internal/docs/members";
import type { ActionDoc } from "@ensforge/tools/internal/docs/model";
import { sectionsOf } from "@ensforge/tools/internal/docs/sections";
import { actionUrl } from "@ensforge/tools/internal/docs/urls";

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
  signature: "function set(client: Like, options: set.Options): Promise<set.ReturnType>",
  source: { file: "packages/sdk/src/actions/record/set/index.ts", line: 42 },
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
      ? { name: "useSetRecords", url: "/docs/reference/react/use-set-records" }
      : undefined,
};

describe("actionPage", () => {
  const page = actionPage(write, links);
  const has = (text: string) => assert.isTrue(Str.includes(text)(page), `missing: ${text}`);

  it("titles the page by the action path, with its meta strip and a source link", () => {
    has('title: "record.set"');
    has(
      '<ApiMeta kind={"Write"} stability={"stable"} since={"1.0.0"} source={"packages/sdk/src/actions/record/set/index.ts#L42"} />',
    );
  });

  it("orders its sections as effect.website does", () => {
    const order = [
      "## When to use",
      "## Signature",
      "## Parameters",
      "## Returns",
      "## Errors",
      "## Examples",
      "## See also",
    ];
    const positions = Arr.map(order, (heading) =>
      Option.getOrElse(Str.indexOf(heading)(page), () => -1),
    );
    assert.notInclude(positions, -1);
    assert.deepStrictEqual(positions, Arr.sort(positions, Order.Number));
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
    has("Also takes the [write options](/docs/reference/sdk/client#write-options).");
    has("Resolves to `Write.Result`. Submitted hashes.");
    has(
      "[`NOT_OWNER`](/docs/reference/errors/NOT_OWNER), [`MISSING_ROLES`](/docs/reference/errors/MISSING_ROLES)",
    );
    has("[`UnauthorizedError`](/docs/reference/errors/unauthorized-error)");
    has("`Errors.WriteError`");
    has("| `record.set.prepare(options)` | Builds the plan without sending anything. |");
    has("## Wait for the receipt with `setSync`");
    has("In React, use [`useSetRecords`](/docs/reference/react/use-set-records).");
    has("- [`record.get`](/docs/reference/sdk/record/get) to read records");
  });
});

const notOwner = {
  code: "NOT_OWNER",
  errorClass: "UnauthorizedError",
  root: "sdk",
  shortMessage: "The account does not own the name.",
  hint: undefined,
  retryable: false,
  user: { title: "Not allowed", message: "You do not own this name." },
};

const unauthorized = {
  name: "UnauthorizedError",
  root: "sdk",
  summary: "The account may not change the name.",
  source: { file: "packages/sdk/src/errors/classes/UnauthorizedError.ts", line: 10 },
  fields: [],
  codes: [notOwner],
};

describe("domainPage", () => {
  it("counts the domain's actions and groups them by kind", () => {
    const page = domainPage("sdk", "record", [write], () => undefined);
    const has = (text: string) => assert.isTrue(Str.includes(text)(page), `missing: ${text}`);

    has('summary={"1 action · 1 write"}');
    has('source={"packages/sdk/src/actions/record"}');
    has("## Writes");
    has("| [`set`](/docs/reference/sdk/record/set) | Writes records of an ENS name. |");
    assert.isFalse(Str.includes("## Reads")(page), "no reads, no Reads section");
  });
});

describe("errorClassPage", () => {
  it("lists the class's codes with their pages and retry safety", () => {
    const page = errorClassPage(unauthorized, () => undefined);

    assert.include(page, 'title: "UnauthorizedError"');
    assert.include(
      page,
      "| [`NOT_OWNER`](/docs/reference/errors/NOT_OWNER) | The account does not own the name. | No |",
    );
  });
});

describe("errorCodePage", () => {
  it("shows the developer and user copy, retry safety and the actions that name the code", () => {
    const page = errorCodePage(
      notOwner,
      unauthorized,
      [{ path: "record.set", url: actionUrl("sdk", "record", "set"), when: "when not the owner." }],
      () => undefined,
    );
    const has = (text: string) => assert.isTrue(Str.includes(text)(page), `missing: ${text}`);

    has('title: "NOT_OWNER"');
    has("The account does not own the name.");
    has("| Not allowed | You do not own this name. |  |");
    has("`retryable: false`");
    has("| [`record.set`](/docs/reference/sdk/record/set) | when not the owner. |");
    has(
      '<ErrorMeta errorClass={"UnauthorizedError"} href="/docs/reference/errors/unauthorized-error" package={"@ensforge/sdk"} />',
    );
    has('`Errors.hasCode("NOT_OWNER")`');
    assert.isFalse(Str.includes("## How to fix")(page), "no hint, no fix section");
  });
});
