import { Effect } from "effect";

import {
  abiResolverInterfaceId,
  addressResolverInterfaceId,
  contenthashResolverInterfaceId,
  dataResolverInterfaceId,
  dnsRecordResolverInterfaceId,
  dnsZoneResolverInterfaceId,
  extendedResolverInterfaceId,
  interfaceResolverInterfaceId,
  nameResolverInterfaceId,
  pubkeyResolverInterfaceId,
  textResolverInterfaceId,
} from "@ensforge/contracts/shared";
import { resolverInterfaceIds } from "@ensforge/contracts/v2";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { supportsInterfaces } from "../../../internal/capabilities/interface-support.js";
import { getResolverAuthorizationModel } from "../../../internal/capabilities/resolver-authorization.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import { findResolver } from "../../resolution/get-resolver/find.js";
import type { CapabilityError, NameCapabilityParameters, ResolverCapabilities } from "../types.js";

const resolverInterfaces = {
  address: addressResolverInterfaceId,
  text: textResolverInterfaceId,
  contentHash: contenthashResolverInterfaceId,
  abi: abiResolverInterfaceId,
  pubkey: pubkeyResolverInterfaceId,
  interface: interfaceResolverInterfaceId,
  name: nameResolverInterfaceId,
  data: dataResolverInterfaceId,
  dnsRecord: dnsRecordResolverInterfaceId,
  dnsZone: dnsZoneResolverInterfaceId,
  extended: extendedResolverInterfaceId,
  permissioned: resolverInterfaceIds.permissionedResolver,
} as const;

const emptyProfiles = {
  address: false,
  text: false,
  contentHash: false,
  abi: false,
  pubkey: false,
  interface: false,
  name: false,
  data: false,
  dnsRecord: false,
  dnsZone: false,
} as const;

const getResolverCapabilitiesEffect = Effect.fn("ensforge.getResolverCapabilities")(function* (
  config: EnsforgeConfig,
  parameters: NameCapabilityParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const discovery = yield* findResolver(name);

      if (discovery === null) {
        return {
          address: null,
          node: namehash(name),
          inherited: false,
          extended: false,
          permissioned: false,
          authorization: "none",
          profiles: emptyProfiles,
        } as const satisfies ResolverCapabilities;
      }

      const support = yield* supportsInterfaces(discovery.address, resolverInterfaces);
      const deployment = yield* DeploymentService;
      const { extended, permissioned, ...profiles } = support;

      return {
        address: discovery.address,
        node: discovery.node,
        inherited: discovery.offset > 0n,
        extended,
        permissioned,
        authorization: getResolverAuthorizationModel(
          discovery.address,
          permissioned,
          deployment.profile,
        ),
        profiles: permissioned
          ? {
              ...profiles,
              address: true,
              text: true,
              contentHash: true,
              abi: true,
              interface: true,
              name: true,
              data: true,
              pubkey: false,
              dnsRecord: false,
              dnsZone: false,
            }
          : profiles,
      } as const satisfies ResolverCapabilities;
    }),
  );
});

export const getResolverCapabilities = defineReadAction<
  NameCapabilityParameters,
  ResolverCapabilities,
  CapabilityError
>(getResolverCapabilitiesEffect);

export type {
  CapabilityError as GetResolverCapabilitiesError,
  NameCapabilityParameters as GetResolverCapabilitiesParameters,
  ResolverCapabilities,
  ResolverProfiles,
} from "../types.js";
