import { describe, expectTypeOf, it } from "@effect/vitest";
import type { Effect } from "effect";

import { Actions, type Errors, type Request } from "@ensforge/sdk";
import type { Actions as EffectActions } from "@ensforge/sdk/effect";

type ErrorOf<action> = action extends (
  ...args: never
) => Effect.Effect<infer _value, infer error, infer _requirements>
  ? error
  : never;

describe("action error types", () => {
  it("are the classes `@throws` names plus the common ones", () => {
    expectTypeOf<Actions.record.getText.ErrorType>().toEqualTypeOf<
      | Errors.CommonError
      | Errors.InvalidInputError
      | Errors.NotFoundError
      | Errors.UnsupportedError
      | Errors.GatewayError
      | Errors.DnsError
    >();
    expectTypeOf<Actions.role.grant.ErrorType>().toEqualTypeOf<
      Errors.WriteError | Errors.InvalidInputError | Errors.UnauthorizedError
    >();
    expectTypeOf<Errors.UnauthorizedError>().not.toExtend<Actions.record.getText.ErrorType>();
  });

  it("type the Effect actions' error channels", () => {
    expectTypeOf<
      ErrorOf<typeof EffectActions.record.getText>
    >().toEqualTypeOf<Actions.record.getText.ErrorType>();
    // Generic actions declare it in their own signature.
    expectTypeOf<
      ErrorOf<typeof EffectActions.record.get>
    >().toEqualTypeOf<Actions.record.get.ErrorType>();
  });

  it("type a write, its methods and its Sync form", () => {
    type Declared = Actions.record.set.ErrorType;

    expectTypeOf<ErrorOf<typeof EffectActions.record.set>>().toEqualTypeOf<Declared>();
    expectTypeOf<ErrorOf<typeof EffectActions.record.set.prepare>>().toEqualTypeOf<Declared>();
    expectTypeOf<ErrorOf<typeof EffectActions.record.set.simulate>>().toEqualTypeOf<Declared>();
    expectTypeOf<ErrorOf<typeof EffectActions.record.set.estimateGas>>().toEqualTypeOf<Declared>();
    expectTypeOf<
      ErrorOf<typeof EffectActions.record.setSync>
    >().toEqualTypeOf<Actions.record.setSync.ErrorType>();
  });

  it("carry into batch requests and their results", () => {
    expectTypeOf(Actions.name.get.request({ name: "a.eth" })).toExtend<
      Request<Actions.name.get.ReturnType, Actions.name.get.ErrorType>
    >();

    const requests = [
      Actions.name.get.request({ name: "a.eth" }),
      Actions.registration.isAvailable.request({ name: "a.eth" }),
    ] as const;
    type Failure<result> = result extends {
      readonly status: "failure";
      readonly error: infer error;
    }
      ? error
      : never;
    type Results = Actions.batch.ReturnType<typeof requests>["results"];

    expectTypeOf<Failure<Results[0]>>().toEqualTypeOf<Actions.name.get.ErrorType>();
    expectTypeOf<Actions.batch.ErrorType<typeof requests, false>>().toEqualTypeOf<
      | Errors.CommonError
      | Errors.InvalidInputError
      | Actions.name.get.ErrorType
      | Actions.registration.isAvailable.ErrorType
    >();
    expectTypeOf<Actions.batch.ErrorType<typeof requests>>().toEqualTypeOf<Errors.CommonError>();
  });
});
