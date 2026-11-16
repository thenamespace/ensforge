import { Effect } from "effect";

import { standardRentPriceOracleV2IsPaymentTokenAbi } from "@ensforge/contracts/internal";
import {
  permissionedResolverV2Abi,
  enhancedAccessControlRoles,
  ethRegistrarV2Abi,
  verifiableFactoryV2Abi,
  defaultReverseRegistrarAdapterV2Abi,
} from "@ensforge/contracts/v2";
import {
  concatHex,
  decodeFunctionData,
  encodeFunctionData,
  encodeAbiParameters,
  erc20Abi,
  getCreate2Address,
  keccak256,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";

import type {
  PreparedHcaCalls,
  VerifiedHcaAccount,
  VerifiedHcaSession,
} from "../../actions/hca/types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { HcaError } from "../../errors/hca-error.js";
import { hcaRpc, resolveHcaProfile } from "./context.js";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const decode = <A extends Abi>(abi: A, data: Hex) => {
  const decoded = decodeFunctionData({ abi, data });

  if (
    !same(encodeFunctionData({ abi, ...decoded } as Parameters<typeof encodeFunctionData>[0]), data)
  )
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Session calls must use canonical ABI encoding",
    });

  return decoded;
};

const recordSetters = new Set([
  "setABI",
  "setAddress",
  "setContenthash",
  "setData",
  "setInterface",
  "setName",
  "setText",
]);

const resolverCall = (data: Hex, depth = 0): boolean => {
  if (depth > 32)
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Resolver multicall nesting exceeds the preparation limit",
    });

  const call = decode(permissionedResolverV2Abi, data);

  if (call.functionName === "multicall") {
    const calls = call.args[0];

    return calls.map((nested) => resolverCall(nested, depth + 1)).some(Boolean);
  }

  if (!recordSetters.has(call.functionName))
    throw new HcaError({
      code: "INVALID_EXECUTION",
      message: "Resolver management is outside the fixed ENS session policy",
    });

  return false;
};

/** Mirrors the recorded validator policy, including calldata, ordering and resolver provenance. */
export const validateHcaSessionCalls = Effect.fn("validateHcaSessionCalls")(function* (
  config: EnsforgeConfig,
  account: VerifiedHcaAccount,
  session: VerifiedHcaSession,
  calls: PreparedHcaCalls["calls"],
) {
  const profile = yield* resolveHcaProfile(config);
  const contracts = profile.deployment.contracts;
  const resolverCode = yield* hcaRpc(() =>
    config.publicClient.getCode({ address: session.resolver }),
  );

  const resolverExists = resolverCode !== undefined && resolverCode !== "0x";
  const proxyLogic = yield* hcaRpc(() =>
    config.publicClient.readContract({
      address: contracts.verifiableFactory,
      abi: verifiableFactoryV2Abi,
      functionName: "proxyLogic",
    }),
  );

  const state = yield* Effect.try({
    try: () => {
      let deploys = false;
      let usesResolver = false;
      const paymentTokens = new Set<Address>();

      for (const call of calls) {
        if (call.value !== 0n)
          throw new HcaError({
            code: "INVALID_EXECUTION",
            message: "Session calls cannot transfer native value",
          });

        if (same(call.to, contracts.ethRegistrar)) {
          const decoded = decode(ethRegistrarV2Abi, call.data);

          if (decoded.functionName === "commit") continue;

          if (decoded.functionName !== "register")
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Sessions only permit registrar commit/register",
            });

          if (decoded.functionName === "register") {
            if (
              !same(decoded.args[1], account.owner) ||
              !same(decoded.args[3], zeroAddress) ||
              !same(decoded.args[4], session.resolver)
            )
              throw new HcaError({
                code: "INVALID_EXECUTION",
                message: "Registration must name the immutable owner and bound resolver",
              });

            if (!resolverExists && !deploys)
              throw new HcaError({
                code: "INVALID_EXECUTION",
                message: "Deploy the resolver before registration",
              });

            usesResolver = true;
          }

          continue;
        }

        if (same(call.to, session.resolver)) {
          if (!resolverExists && !deploys)
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Deploy the resolver before writing records",
            });

          resolverCall(call.data);
          usesResolver = true;
          continue;
        }

        if (same(call.to, contracts.defaultReverseRegistrarAdapter)) {
          const decoded = decode(defaultReverseRegistrarAdapterV2Abi, call.data);

          if (
            decoded.functionName !== "setNameWithHCA" ||
            !same(decoded.args[0], account.owner) ||
            same(session.resolver, zeroAddress)
          )
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Reverse records must target the immutable owner",
            });

          continue;
        }

        if (call.data.slice(0, 10).toLowerCase() === "0x095ea7b3") {
          const decoded = decode(erc20Abi, call.data);

          if (decoded.functionName !== "approve")
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Sessions only permit payment token approvals",
            });

          if (
            decoded.functionName === "approve" &&
            !same(decoded.args[0], contracts.ethRegistrar) &&
            !(
              session.refund &&
              same(call.to, session.refund.token) &&
              same(decoded.args[0], profile.infrastructure.gasRefundPaymaster) &&
              decoded.args[1] <= session.refund.maxAmount
            )
          )
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Approval spender or amount is outside the session limits",
            });

          if (same(decoded.args[0], contracts.ethRegistrar)) paymentTokens.add(call.to);

          continue;
        }

        if (same(call.to, contracts.verifiableFactory)) {
          const decoded = decode(verifiableFactoryV2Abi, call.data);

          if (decoded.functionName !== "deployProxy" || deploys || resolverExists)
            throw new HcaError({
              code: "INVALID_EXECUTION",
              message: "Session permits one new bound resolver deployment",
            });

          if (decoded.functionName === "deployProxy") {
            const [implementation, userSalt, initialization] = decoded.args;
            const decodedInitialization = decode(permissionedResolverV2Abi, initialization);
            if (
              !same(implementation, profile.deployment.implementations.permissionedResolver) ||
              decodedInitialization.functionName !== "initialize"
            )
              throw new HcaError({
                code: "INVALID_EXECUTION",
                message: "Resolver must use the recorded implementation and initialization",
              });

            const [grants, setters] = decodedInitialization.args;
            if (
              grants.length !== 2 ||
              !grants[0] ||
              !grants[1] ||
              !same(grants[0].account, account.address) ||
              !same(grants[1].account, account.owner) ||
              grants.some((grant) => grant.roleBitmap !== enhancedAccessControlRoles.allRoles)
            )
              throw new HcaError({
                code: "INVALID_EXECUTION",
                message:
                  "Resolver initialization requires HCA and owner ALL-role grants in that order",
              });

            for (const setter of setters) resolverCall(setter);

            const salt = keccak256(
              encodeAbiParameters(
                [{ type: "address" }, { type: "uint256" }],
                [account.address, userSalt],
              ),
            );

            const bytecode = concatHex([
              "0x3d604d80600a3d3981f3363d3d373d3d3d363d73",
              proxyLogic,
              "0x5af43d82803e903d91602b57fd5bf3",
              salt,
            ]);

            if (
              !same(
                getCreate2Address({ from: contracts.verifiableFactory, salt, bytecode }),
                session.resolver,
              )
            )
              throw new HcaError({
                code: "INVALID_EXECUTION",
                message: "Deployment does not produce the bound resolver",
              });

            deploys = true;
            usesResolver = true;
          }

          continue;
        }

        throw new HcaError({
          code: "INVALID_EXECUTION",
          message: "Call target is outside the fixed ENS session policy",
        });
      }

      return { usesResolver, paymentTokens };
    },
    catch: (cause) =>
      cause instanceof HcaError
        ? cause
        : new HcaError({ code: "INVALID_EXECUTION", message: "Invalid session calldata", cause }),
  });

  // The deployed validator asks the registrar's oracle; refund tokens are a separate policy.
  if (state.paymentTokens.size > 0) {
    const oracle = yield* hcaRpc(() =>
      config.publicClient.readContract({
        address: contracts.ethRegistrar,
        abi: ethRegistrarV2Abi,
        functionName: "rentPriceOracle",
      }),
    );

    for (const token of state.paymentTokens) {
      const accepted = yield* hcaRpc(() =>
        config.publicClient.readContract({
          address: oracle,
          abi: standardRentPriceOracleV2IsPaymentTokenAbi,
          functionName: "isPaymentToken",
          args: [token],
        }),
      );

      if (!accepted)
        return yield* new HcaError({
          code: "INVALID_EXECUTION",
          message: "The registrar does not accept this session payment token",
        });
    }
  }

  if (state.usesResolver && resolverExists) {
    const implementation = yield* hcaRpc(() =>
      config.publicClient.readContract({
        address: contracts.verifiableFactory,
        abi: verifiableFactoryV2Abi,
        functionName: "verifyContract",
        args: [session.resolver],
      }),
    );

    if (!same(implementation, profile.deployment.implementations.permissionedResolver))
      return yield* new HcaError({
        code: "DEPLOYMENT_MISMATCH",
        message: "Session resolver is not a verified Permissioned Resolver proxy",
      });
  }
});
