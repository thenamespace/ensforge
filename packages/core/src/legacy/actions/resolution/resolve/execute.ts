import { Effect, Schema } from "effect";

import { zeroAddress } from "viem";

import type { ResolvedGatewayOptions } from "../../../config/gateway-options.js";
import { CodecError } from "../../../errors/codec-error.js";
import { isContractRevert } from "../../../internal/errors/viem-error.js";
import { validateGatewayUrl } from "../../../internal/gateway/validate-url.js";
import { resolveName, resolveNameWithResolver } from "../../../internal/resolver/resolve-name.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { normalizeName } from "../../../names/normalize.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { ResolveBatchCall } from "../resolve-batch/types.js";
import type { ResolveResult } from "./types.js";

export const executeResolveCall = Effect.fn("executeResolveCall")(function* (
  call: ResolveBatchCall,
  gatewayPolicy?: ResolvedGatewayOptions,
) {
  const name = yield* normalizeName.effect(call.name);

  const data = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(Hex)(call.data),
    catch: () =>
      new CodecError({
        code: "INVALID_HEX",
        message: "Resolver calldata must be byte-aligned hexadecimal data",
      }),
  });

  const dnsName = yield* dnsEncodeName.effect(name);
  const deployment = yield* DeploymentService;
  const protocol = deployment.profile.protocol;

  const universalResolver =
    protocol === "v1"
      ? deployment.profile.v1.contracts.universalResolver
      : deployment.profile.v2.contracts.universalResolver;

  if (call.resolverAddress === undefined) {
    const resolved = yield* resolveName({
      universalResolver,
      protocol,
      name: dnsName,
      data,
    }).pipe(
      Effect.catchIf(
        (error) => isContractRevert(error.cause, "ResolverNotFound"),
        () => Effect.succeed(null),
      ),
    );

    return resolved === null
      ? null
      : ({ data: resolved[0], resolverAddress: resolved[1] } satisfies Exclude<
          ResolveResult,
          null
        >);
  }

  const resolverAddress = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(EthereumAddress)(call.resolverAddress),
    catch: () =>
      new CodecError({
        code: "INVALID_ADDRESS",
        message: `Invalid resolver address: ${call.resolverAddress}`,
      }),
  });

  if (resolverAddress === zeroAddress) {
    return yield* new CodecError({
      code: "INVALID_ADDRESS",
      message: "Resolver address cannot be the zero address",
    });
  }

  if (gatewayPolicy !== undefined) {
    yield* Effect.forEach(call.gateways ?? [], (gateway) =>
      validateGatewayUrl(gateway, gatewayPolicy),
    );
  }

  const result = yield* resolveNameWithResolver({
    universalResolver,
    resolver: resolverAddress,
    protocol,
    name: dnsName,
    data,
    gateways: call.gateways ?? [],
  });

  return { data: result, resolverAddress };
});
