import { Array as Arr, String as Str } from "effect";

import { fieldsTable } from "./actionPages.ts";
import { code, type LinkResolver, page, plain, prose, table } from "./mdx.ts";
import type { ErrorClassDoc, ErrorCodeDoc, Thrower } from "./model.ts";

/** Classes every read can fail with (`Errors.CommonError`) and the ones every write adds. */
const common = new Set(["ConfigError", "ContractRevertError", "InternalError", "NetworkError"]);
const writes = new Set([
  "InsufficientFundsError",
  "TransactionError",
  "UnsupportedError",
  "UserRejectedError",
  "WalletError",
]);

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
  const classScope = common.has(error.errorClass)
    ? `Any action can fail with ${code(error.errorClass)}: it is part of ${code("Errors.CommonError")}.`
    : writes.has(error.errorClass)
      ? `Any write can fail with ${code(error.errorClass)}: it is part of ${code("Errors.WriteError")}.`
      : "";
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
      description: `Fix ${error.code} (${errorClass.name}): ${plain(error.shortMessage) || "what the code means."}`,
      keywords: [error.code, error.errorClass],
    },
    [
      `**Class** [${code(error.errorClass)}](/docs/sdk/errors#${Str.toLowerCase(error.errorClass)}) · **Code** ${code(error.code)} · **Package** ${code(error.root === "hca" ? "@ensforge/hca" : "@ensforge/sdk")}`,
      `## What happened\n\n${prose(error.shortMessage || errorClass.summary, resolve)}`,
      `## What to show users\n\n${user}`,
      error.hint === undefined ? "" : `## How to fix\n\n${prose(error.hint, resolve)}`,
      `## Retry safety\n\n${
        error.retryable
          ? "Retrying the same call can succeed (`retryable: true`)."
          : "Retrying the same call fails the same way until the cause is fixed (`retryable: false`)."
      }`,
      `## Actions that throw it\n\n${Arr.join(
        Arr.filter([thrownBy, classScope], (block) => block !== ""),
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

/** All codes, grouped by class, with one line each. */
export const errorsIndexPage = (classes: readonly ErrorClassDoc[], resolve: LinkResolver): string =>
  page(
    {
      title: "Errors",
      description: "Look up every error code ensforge throws, grouped by error class.",
      keywords: Arr.map(classes, (errorClass) => errorClass.name),
    },
    [
      "Every error ensforge throws has a class (`_tag`) and a code. Each code has its own page, the one `error.docsUrl` points to. See [How errors work](/docs/sdk/errors-explained).",
      ...Arr.map(classes, (errorClass) =>
        Arr.join(
          Arr.filter(
            [
              `## ${errorClass.name}`,
              prose(errorClass.summary, resolve),
              errorClass.fields.length === 0
                ? ""
                : `Fields:\n\n${fieldsTable(errorClass.fields, resolve)}`,
              table(
                ["Code", "Meaning"],
                Arr.map(errorClass.codes, (error) => [
                  `[${code(error.code)}](/docs/sdk/errors/${error.code})`,
                  prose(error.shortMessage, resolve),
                ]),
              ),
            ],
            (block) => block !== "",
          ),
          "\n\n",
        ),
      ),
    ],
  );
