import { Array as Arr, Formatter } from "effect";

import { cards, fieldsTable } from "./actionPages.ts";
import { describe, keywordsFor } from "./descriptions.ts";
import {
  apiMeta,
  code,
  firstSentence,
  type LinkResolver,
  page,
  plain,
  prose,
  sourceAttribute,
  table,
} from "./mdx.ts";
import type { ErrorClassDoc, ErrorCodeDoc, Thrower } from "./model.ts";
import { errorClassUrl, errorUrl } from "./urls.ts";

/** Classes every read can fail with (`Errors.CommonError`) and the ones every write adds. */
const common = new Set(["ConfigError", "ContractRevertError", "InternalError", "NetworkError"]);
const writes = new Set([
  "InsufficientFundsError",
  "TransactionError",
  "UnsupportedError",
  "UserRejectedError",
  "WalletError",
]);

const packageOf = (root: string) => (root === "hca" ? "@ensforge/hca" : "@ensforge/sdk");

const classScope = (name: string): string =>
  common.has(name)
    ? `Any action can fail with ${code(name)}: it is part of ${code("Errors.CommonError")}.`
    : writes.has(name)
      ? `Any write can fail with ${code(name)}: it is part of ${code("Errors.WriteError")}.`
      : "";

/** One page per error code, at the URL its `docsUrl` points to. */
export const errorCodePage = (
  error: ErrorCodeDoc,
  errorClass: ErrorClassDoc,
  throwers: readonly Thrower[],
  resolve: LinkResolver,
): string => {
  const user =
    error.user === undefined
      ? "This code has no end-user copy in `Errors.describe`; show a generic message."
      : table(
          ["Title", "Message", "Action"],
          [[error.user.title, error.user.message, error.user.action ?? ""]],
        );
  const thrownBy =
    throwers.length === 0
      ? "No action names this code in its documented errors."
      : table(
          ["Action", "When"],
          Arr.map(throwers, (thrower) => [
            `[${code(thrower.path)}](${thrower.url})`,
            prose(thrower.when, resolve),
          ]),
        );

  return page(
    {
      title: error.code,
      description: describe(
        `What ${error.code} means, why ${errorClass.name} throws it, what to show users and how to fix it in ensforge.`,
        "Also covers retry safety and the actions that throw it.",
        "Also covers retry safety.",
      ),
      keywords: keywordsFor([
        error.code,
        error.errorClass,
        `@ensforge/${error.root}`,
        "error",
        "error code",
      ]),
    },
    [
      `<ErrorMeta errorClass={${Formatter.formatJson(error.errorClass)}} href="${errorClassUrl(error.errorClass)}" package={${Formatter.formatJson(packageOf(error.root))}}${error.retryable ? " retryable" : ""} />`,
      `## What happened\n\n${prose(error.shortMessage || errorClass.summary, resolve)}`,
      `## What to show users\n\n${user}`,
      error.hint === undefined ? "" : `## How to fix\n\n${prose(error.hint, resolve)}`,
      `## Retry safety\n\n${
        error.retryable
          ? "Retrying the same call can succeed (`retryable: true`)."
          : "Retrying the same call fails the same way until the cause is fixed (`retryable: false`)."
      }`,
      `## Actions that throw it\n\n${Arr.join(
        Arr.filter([thrownBy, classScope(error.errorClass)], (block) => block !== ""),
        "\n\n",
      )}`,
      `## Catch it\n\n${
        error.root === "sdk"
          ? `${code(`Errors.hasCode("${error.code}")`)} narrows to this error.`
          : `Check ${code(`error instanceof ${error.errorClass} && error.code === "${error.code}"`)}.`
      } See [Handle errors](/docs/sdk/handle-errors).`,
    ],
  );
};

/** One page per error class: what it means, its fields and every code it carries. */
export const errorClassPage = (errorClass: ErrorClassDoc, resolve: LinkResolver): string =>
  page(
    {
      title: errorClass.name,
      description: describe(
        `What ${errorClass.name} means, which codes it carries and how to catch it in ensforge.`,
        plain(firstSentence(errorClass.summary)),
        "Lists its fields and every code.",
        "Includes how to catch it.",
      ),
      keywords: keywordsFor([
        errorClass.name,
        `@ensforge/${errorClass.root}`,
        "error class",
        ...Arr.map(errorClass.codes, (error) => error.code),
      ]),
    },
    [
      apiMeta({
        kind: "Error class",
        summary: `${errorClass.codes.length} codes · ${packageOf(errorClass.root)}`,
        source: sourceAttribute(errorClass.source),
      }),
      prose(errorClass.summary, resolve),
      classScope(errorClass.name),
      errorClass.fields.length === 0
        ? ""
        : `## Fields\n\n${fieldsTable(errorClass.fields, resolve)}`,
      `## Codes\n\n${table(
        ["Code", "Meaning", "Retryable"],
        Arr.map(errorClass.codes, (error) => [
          `[${code(error.code)}](${errorUrl(error.code)})`,
          prose(error.shortMessage, resolve),
          error.retryable ? "Yes" : "No",
        ]),
      )}`,
      `## Catch it\n\n${
        errorClass.root === "sdk"
          ? `${code(`Effect.catchTag("${errorClass.name}", …)`)} or ${code(`error instanceof Errors.${errorClass.name}`)}.`
          : `${code(`error instanceof ${errorClass.name}`)}.`
      } See [Handle errors](/docs/sdk/handle-errors).`,
    ],
  );

/** The errors home: one card per class, then every code in one table. */
export const errorsIndexPage = (
  classes: readonly ErrorClassDoc[],
  resolve: LinkResolver,
): string => {
  const codes = Arr.flatMap(classes, (errorClass) => errorClass.codes);
  return page(
    {
      title: "Errors",
      description: describe(
        `Look up all ${codes.length} error codes ensforge throws, grouped by ${classes.length} error classes, with what each means and how to fix it.`,
        "Each code has its own page.",
      ),
      keywords: keywordsFor([
        "errors",
        "error codes",
        ...Arr.map(classes, (errorClass) => errorClass.name),
      ]),
    },
    [
      apiMeta({ summary: `${codes.length} codes · ${classes.length} classes` }),
      "Every error ensforge throws has a class (`_tag`) and a code. Each code has its own page, the one `error.docsUrl` points to. See [How errors work](/docs/sdk/errors-explained).",
      `## Classes\n\n${cards(
        Arr.map(classes, (errorClass) => ({
          title: errorClass.name,
          url: errorClassUrl(errorClass.name),
          description: `${errorClass.codes.length} codes. ${plain(firstSentence(errorClass.summary))}`,
        })),
      )}`,
      `## Codes\n\n${table(
        ["Code", "Class", "Meaning"],
        Arr.map(codes, (error) => [
          `[${code(error.code)}](${errorUrl(error.code)})`,
          `[${code(error.errorClass)}](${errorClassUrl(error.errorClass)})`,
          prose(error.shortMessage, resolve),
        ]),
      )}`,
    ],
  );
};
