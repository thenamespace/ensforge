import { assert, describe, it } from "@effect/vitest";

import { describeDocsPage } from "@ensforge/docs/internal/lib/analytics/docs-page";

describe("describeDocsPage", () => {
  it("names the API on action, hook and error-code pages", () => {
    assert.deepStrictEqual(
      describeDocsPage(
        "reference/sdk/record/get.mdx",
        ["reference", "sdk", "record", "get"],
        "record.get",
      ),
      {
        docKind: "reference_action",
        apiName: "record.get",
      },
    );
    assert.deepStrictEqual(
      describeDocsPage(
        "reference/react/(hooks)/use-address.mdx",
        ["reference", "react", "use-address"],
        "useAddress",
      ),
      {
        docKind: "reference_hook",
        apiName: "useAddress",
      },
    );
    assert.deepStrictEqual(
      describeDocsPage(
        "reference/errors/(name-state-error)/NAME_EXPIRED.mdx",
        ["reference", "errors", "NAME_EXPIRED"],
        "NAME_EXPIRED",
      ),
      { docKind: "reference_error", apiName: "NAME_EXPIRED" },
    );
  });

  it("leaves other reference pages without an API name", () => {
    assert.deepStrictEqual(
      describeDocsPage("reference/sdk/record/index.mdx", ["reference", "sdk", "record"], "Records"),
      {
        docKind: "reference_other",
        apiName: undefined,
      },
    );
    assert.strictEqual(
      describeDocsPage("reference/sdk/client.mdx", ["reference", "sdk", "client"], "Client")
        .docKind,
      "reference_other",
    );
    assert.strictEqual(
      describeDocsPage("reference/contracts/abis.mdx", ["reference", "contracts", "abis"], "ABIs")
        .docKind,
      "reference_other",
    );
  });

  it("tells migration guides from other guides", () => {
    assert.strictEqual(
      describeDocsPage(
        "sdk/(migrate)/from-ensforge-0x.mdx",
        ["sdk", "from-ensforge-0x"],
        "From 0.x",
      ).docKind,
      "migration",
    );
    assert.strictEqual(
      describeDocsPage("sdk/installation.mdx", ["sdk", "installation"], "Installation").docKind,
      "guide",
    );
  });
});
