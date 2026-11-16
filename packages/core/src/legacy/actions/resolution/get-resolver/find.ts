import { Effect } from "effect";

import { universalResolverFindResolverAbi } from "@ensforge/contracts/shared";
import { isAddressEqual, zeroAddress } from "viem";

import type { CodecError } from "../../../errors/codec-error.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import type { ViemError } from "../../../internal/errors/viem-error.js";
import type { ReadContext } from "../../../internal/read/execution-context.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { namehash } from "../../../names/hashes.js";
import type { Namehash } from "../../../schemas/hash.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { NormalizedName } from "../../../schemas/name.js";

export interface ResolverDiscovery {
  readonly address: EthereumAddress;
  readonly node: Namehash;
  readonly offset: bigint;
}

export const findResolver = Effect.fn("findResolver")(function* (
  name: NormalizedName,
): Effect.fn.Return<
  ResolverDiscovery | null,
  CodecError | ViemError,
  DeploymentService | EthereumClient | ReadContext
> {
  const deployment = yield* DeploymentService;
  const ethereum = yield* EthereumClient;
  const dnsName = yield* dnsEncodeName.effect(name);

  const universalResolver =
    deployment.profile.protocol === "v1"
      ? deployment.profile.v1.contracts.universalResolver
      : deployment.profile.v2.contracts.universalResolver;

  yield* Effect.annotateCurrentSpan({
    "ens.name": name,
    "ens.deployment.protocol": deployment.profile.protocol,
  });

  const [address, , offset] = yield* ethereum.readContract({
    address: universalResolver,
    abi: universalResolverFindResolverAbi,
    functionName: "findResolver",
    args: [dnsName],
  });

  return isAddressEqual(address, zeroAddress)
    ? null
    : {
        address,
        node: namehash(name),
        offset,
      };
});
