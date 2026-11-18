import { Console, Effect } from "effect";
import { Command, Flag } from "effect/cli";

import { readPages } from "../docs/content.ts";
import { descriptionRange, lintPages, llmsBudget } from "../docs/lint.ts";
import { CheckFailed } from "../errors.ts";
import { Workspace } from "../services/Workspace.ts";

/**
 * Checks every docs page (generated ones too): a `description` of 120-160 characters, internal
 * `/docs/...` links that resolve to a page and a heading anchor, and the description and title
 * budget of the pages `llms.txt` lists (hand-written, landing, package, domain and class pages).
 * Every check fails the run; `strictDescriptions = false` turns the length check into a warning.
 */
export const strictDescriptions = true;

export const docsLint = Effect.fn("docs.lint")(function* (strict: boolean) {
  const workspace = yield* Workspace;
  const pages = yield* readPages(workspace.root);
  const problems = lintPages(pages);

  yield* Console.log(
    `docs lint: descriptions + titles total ${problems.budget.characters} characters for the pages llms.txt lists (budget ${llmsBudget}), ${problems.budget.total} for all pages`,
  );
  const failing = [...problems.links, ...problems.budget.problems];
  if (strict) failing.unshift(...problems.descriptions);
  else if (problems.descriptions.length > 0) {
    yield* Console.warn(
      `docs lint: ${problems.descriptions.length} descriptions outside ${descriptionRange.min}-${descriptionRange.max} characters (warning only)`,
    );
    for (const warning of problems.descriptions) yield* Console.warn(`  ${warning}`);
  }

  if (failing.length > 0)
    return yield* CheckFailed.make({
      check: "docs-lint",
      problems: [...failing, `${failing.length} problems`],
    });
  return yield* Console.log("docs lint: ok");
});

export const docsLintCommand = Command.make(
  "lint",
  {
    strict: Flag.Boolean("strict-descriptions").pipe(
      Flag.withDefault(strictDescriptions),
      Flag.withDescription("Fail, not warn, on descriptions outside 120-160 characters"),
    ),
  },
  ({ strict }) => docsLint(strict),
).pipe(Command.withDescription("Check descriptions, internal links and anchors of the docs pages"));
