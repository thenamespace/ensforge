import { Effect } from "effect";

import { universalHelperV2FindExactOwnerAbi } from "@ensforge/contracts/internal";
import { isAddressEqual, zeroAddress } from "viem";

import type { EnsV2ConfigDeployment } from "../../../config/custom-network.js";
import type { CodecError } from "../../../errors/codec-error.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import type { ViemError } from "../../../internal/errors/viem-error.js";
import type { ReadContext } from "../../../internal/read/execution-context.js";
import { dnsEncodeName } from "../../../names/dns.js";
import type { NormalizedName } from "../../../schemas/name.js";
import type { OwnerResult } from "./types.js";

export const getOwnerV2 = Effect.fn("getOwnerV2")(function* (
  name: NormalizedName,
  deployment: EnsV2ConfigDeployment,
): Effect.fn.Return<OwnerResult | null, CodecError | ViemError, EthereumClient | ReadContext> {
  const ethereum = yield* EthereumClient;
  const dnsName = yield* dnsEncodeName.effect(name);

  const owner = yield* ethereum.readContract({
    address: deployment.contracts.universalHelper,
    abi: universalHelperV2FindExactOwnerAbi,
    functionName: "findExactOwner",
    args: [dnsName],
  });

  return isAddressEqual(owner, zeroAddress)
    ? null
    : {
        name,
        owner,
        registrant: null,
        protocol: "v2",
        ownershipLevel: "registry",
      };
});
