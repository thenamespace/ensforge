import { Schema } from "effect";

import { HcaError } from "@ensforge/core/legacy";
import {
  HcaExecutionIdentitySchema,
  HcaExecutionHash,
  HcaExecutionLocator,
} from "@ensforge/core/legacy/hca";

import type { ExecutionSubmission, SubmissionCodec } from "./types.js";

export const executionSubmissionSchema = Schema.Struct({
  ...HcaExecutionIdentitySchema.fields,
  kind: Schema.Literal("adapter"),
  schemaVersion: Schema.Literal(1),
  configurationFingerprint: HcaExecutionHash,
  reference: Schema.NonEmptyString,
  locator: HcaExecutionLocator,
  payload: Schema.Unknown,
});

export const createSubmissionPersistence = <S>(
  id: string,
  fingerprint: `0x${string}`,
  codec: SubmissionCodec<S>,
  context: { readonly chainId: number; readonly profileId: string },
) => {
  const schema = Schema.Struct({ ...executionSubmissionSchema.fields, payload: codec.schema });

  const json = Schema.fromJsonString(
    Schema.Struct({
      codecVersion: Schema.Literal(codec.version),
      submission: Schema.toCodecJson(schema),
    }),
  );

  const validate = (input: unknown): ExecutionSubmission<S> => {
    try {
      // Validate the decoded side without applying codec transformations twice.
      const value = Schema.decodeUnknownSync(Schema.toType(schema), { onExcessProperty: "error" })(
        input,
      );

      if (
        value.chainId !== context.chainId ||
        value.profileId !== context.profileId ||
        value.adapterId !== id ||
        value.instanceId !== fingerprint ||
        value.configurationFingerprint !== fingerprint
      )
        throw new Error("Adapter configuration mismatch");

      if (value.locator.kind !== "intent" && value.locator.chainId !== value.chainId)
        throw new Error("Locator chain mismatch");

      return value;
    } catch (cause) {
      throw new HcaError({
        code: "INVALID_SUBMISSION",
        message: "Invalid submission or adapter configuration",
        cause,
      });
    }
  };

  return {
    validate,
    serializeSubmission: (input: ExecutionSubmission<S>): string => {
      try {
        return Schema.encodeSync(json)({
          codecVersion: codec.version,
          submission: validate(input),
        });
      } catch (cause) {
        throw new HcaError({
          code: "INVALID_SUBMISSION",
          message: "Submission cannot be serialized",
          cause,
        });
      }
    },
    restoreSubmission: (
      serialized: string,
      expected: Pick<ExecutionSubmission<S>, "chainId" | "hca" | "profileId" | "planFingerprint">,
    ): ExecutionSubmission<S> => {
      try {
        const { submission } = Schema.decodeUnknownSync(json, { onExcessProperty: "error" })(
          serialized,
        );

        const value = validate(submission);

        if (
          value.chainId !== expected.chainId ||
          value.hca.toLowerCase() !== expected.hca.toLowerCase() ||
          value.profileId !== expected.profileId ||
          value.planFingerprint !== expected.planFingerprint
        )
          throw new Error("Restored submission does not match the expected operation");

        return value;
      } catch (cause) {
        throw new HcaError({
          code: "INVALID_SUBMISSION",
          message: "Submission restore failed; no provider operation was invoked",
          cause,
        });
      }
    },
  };
};
