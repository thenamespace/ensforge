import { assert, describe, it } from "@effect/vitest";
import { Array as Arr } from "effect";

import { declaredEvents, trackedEvents } from "@ensforge/tools/internal/docs/analytics";

describe("declaredEvents", () => {
  it("lists the keys of AnalyticsEvents, optional ones too, and not nested properties", () => {
    const source = Arr.join(
      [
        "export type Location = string;",
        "export interface AnalyticsEvents {",
        "  // Docs",
        "  docs_page_viewed: {",
        "    slug: string;",
        "  };",
        "  install_command_copied?: { package: string };",
        "}",
      ],
      "\n",
    );

    assert.deepStrictEqual(declaredEvents(source), ["docs_page_viewed", "install_command_copied"]);
  });
});

describe("trackedEvents", () => {
  it("reads plain and conditional event names, not property values", () => {
    const source = Arr.join(
      [
        'track("cta_clicked", { cta: "home_get_started" });',
        'track(isBlog ? "blog_code_copied" : "docs_code_copied", {',
        '  slug: "x",',
        "});",
        'posthog.capture("raw_event", {});',
      ],
      "\n",
    );

    assert.deepStrictEqual(trackedEvents(source), [
      "cta_clicked",
      "blog_code_copied",
      "docs_code_copied",
    ]);
  });
});
