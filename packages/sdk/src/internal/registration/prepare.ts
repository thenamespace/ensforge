import { Effect } from "effect";

import { Abis } from "@ensforge/contracts";
import { ownedResolverSalt } from "@ensforge/contracts/v2";
import { isAddressEqual, isHex, zeroAddress, type Address, type Hex } from "viem";

import type { PaymentToken } from "../../actions/registration/types.js";
import type { Client } from "../../client/types.js";
import { InvalidInputError } from "../../errors/classes/InvalidInputError.js";
import { NameStateError } from "../../errors/classes/NameStateError.js";
import { NotFoundError } from "../../errors/classes/NotFoundError.js";
import type { AnyError } from "../../errors/types.js";
import type { Plan } from "../../plan/Plan.js";
import { sameAddress } from "../address.js";
import { requireAddress } from "../name/write.js";
import type { RecordWrites } from "../records/write-profiles.js";
import { deployPermissionedResolver } from "../resolver/deploy.js";
import * as Rpc from "../rpc/index.js";
import { makeCommitment, randomSecret, resolverSalt } from "./commitment.js";
import { requireRegistrationContracts, type RegistrationContracts } from "./contracts.js";
import { parseEthNames, type EthName } from "./labels.js";
import { paymentTokenAddress, requirePaymentToken } from "./payment.js";
import { referrerOf } from "./referrer.js";

/** What `registration.commit` and `registration.register` take. */
export type RegistrationInput = {
  readonly names: string | readonly string[];
  readonly duration: bigint;
  readonly owner?: string | undefined;
  /**
   * `undefined`: a new PermissionedResolver per name; `"owned"`: the signer's shared one (the ENS
   * app's address); `null`: none.
   */
  readonly resolver?: string | null | undefined;
  readonly records?: Omit<RecordWrites, "clear" | "pubkey"> | undefined;
  readonly primaryName?: boolean | undefined;
  readonly paymentToken?: PaymentToken | undefined;
  readonly subregistry?: string | undefined;
  readonly referrer?: Hex | undefined;
  readonly secret?: Hex | undefined;
};

/** One name of a registration, ready to commit and register. */
export type PreparedName = EthName & {
  readonly commitment: Hex;
  readonly resolver: Address;
  /** The resolver deployment for this name, when ensforge creates its resolver. */
  readonly deploy: Plan.Call | undefined;
  readonly price: { readonly base: bigint; readonly premium: bigint };
  /** Timestamp the commitment was made at, or `0n` when it has not been made. */
  readonly committedAt: bigint;
};

/** A validated registration. */
export type PreparedRegistration = {
  readonly contracts: RegistrationContracts;
  readonly names: readonly PreparedName[];
  readonly owner: Address;
  readonly signer: Address;
  readonly secret: Hex;
  readonly duration: bigint;
  readonly subregistry: Address;
  readonly referrer: Hex;
  readonly token: Address;
  readonly total: bigint;
  readonly records: Omit<RecordWrites, "clear" | "pubkey"> | undefined;
  /** The shared `"owned"` resolver's deployment, when it does not exist yet. */
  readonly ownedDeploy: Plan.Call | undefined;
  /** Explicit (or shared) resolver; records then need their own step. */
  readonly explicitResolver: Address | undefined;
  readonly minCommitmentAge: bigint;
  readonly maxCommitmentAge: bigint;
  readonly now: bigint;
};

const invalid = (field: string, input: unknown, shortMessage: string) =>
  new InvalidInputError({ code: "INVALID_RECORD_VALUE", field, input, shortMessage });

/** Validates options that need no RPC: addresses, secret, and record/primary-name rules. */
const validateOptions = Effect.fnUntraced(function* (
  input: RegistrationInput,
  signer: Address,
  names: readonly EthName[],
): Effect.fn.Return<
  {
    owner: Address;
    subregistry: Address;
    resolver: Address | "owned" | null | undefined;
    secret: Hex;
    records: Omit<RecordWrites, "clear" | "pubkey"> | undefined;
  },
  AnyError
> {
  const owner = input.owner === undefined ? signer : yield* requireAddress(input.owner, "owner");
  const subregistry =
    input.subregistry === undefined
      ? zeroAddress
      : yield* requireAddress(input.subregistry, "subregistry");
  const resolver =
    input.resolver === undefined || input.resolver === null || input.resolver === "owned"
      ? input.resolver
      : yield* requireAddress(input.resolver, "resolver");
  // The shared resolver's address comes from the deployer, which must be the owner it serves.
  if (resolver === "owned" && !isAddressEqual(owner, signer)) {
    return yield* Effect.fail(
      invalid("resolver", "owned", "The shared resolver is only for names the signer owns."),
    );
  }
  if (input.secret !== undefined && !(isHex(input.secret) && input.secret.length === 66)) {
    return yield* Effect.fail(invalid("secret", input.secret, "The secret must be 32 bytes."));
  }

  let records = input.records;
  if (resolver === null && (records !== undefined || input.primaryName === true)) {
    return yield* Effect.fail(
      invalid("resolver", null, "Records and a primary name need a resolver."),
    );
  }
  if (input.primaryName === true) {
    // The reverse record is set for the signer, and must resolve back to it.
    if (names.length !== 1) {
      return yield* Effect.fail(
        invalid("primaryName", names.length, "A primary name needs exactly one name."),
      );
    }
    if (!isAddressEqual(owner, signer)) {
      return yield* Effect.fail(
        invalid("primaryName", owner, "Only the signer's own name can become its primary name."),
      );
    }
    const eth = records?.addresses?.["eth"] ?? records?.addresses?.["60"];
    if (eth !== undefined && !sameAddress(eth as Address | null, owner)) {
      return yield* Effect.fail(
        new NotFoundError({
          code: "PRIMARY_NAME_MISMATCH",
          shortMessage: "The eth address record must be the owner for a primary name.",
        }),
      );
    }
    if (eth === undefined) {
      records = { ...records, addresses: { ...records?.addresses, eth: owner } };
    }
  }

  // A resolver ensforge creates points the name at its owner unless the caller says otherwise.
  const addresses = records?.addresses;
  const managed = resolver === undefined || resolver === "owned";
  if (managed && addresses?.["eth"] === undefined && addresses?.["60"] === undefined) {
    records = { ...records, addresses: { ...addresses, eth: owner } };
  }

  return { owner, subregistry, resolver, secret: input.secret ?? randomSecret(), records };
});

/** The signer's shared PermissionedResolver: its address, and its deployment when missing. */
const ownedResolver = Effect.fnUntraced(function* (
  client: Client,
  signer: Address,
): Effect.fn.Return<
  { readonly address: Address; readonly deploy: Plan.Call | undefined },
  AnyError
> {
  const deployment = yield* deployPermissionedResolver(client, {
    deployer: signer,
    owner: signer,
    salt: ownedResolverSalt(signer),
  });
  const exists = yield* Rpc.hasCode(client, deployment.address);
  return { address: deployment.address, deploy: exists ? undefined : deployment.call };
});

/**
 * Validates a registration and computes everything its plan needs, in two batched rounds:
 * availability, validity, prices and registrar parameters, then commitments and resolver
 * deployments. Fails before anything is sent when a name cannot be registered.
 */
export const prepareRegistration = Effect.fnUntraced(function* (
  client: Client,
  input: RegistrationInput,
  signer: Address,
  /** The account that sends `register` (an HCA through `via`): it deploys the names' resolvers. */
  sender: Address = signer,
): Effect.fn.Return<PreparedRegistration, AnyError> {
  const names = yield* parseEthNames(input.names);
  const contracts = yield* requireRegistrationContracts(client);
  const validated = yield* validateOptions(input, signer, names);
  const owned = validated.resolver === "owned" ? yield* ownedResolver(client, signer) : undefined;
  const options = {
    ...validated,
    resolver: validated.resolver === "owned" ? owned?.address : validated.resolver,
  };
  const token = yield* paymentTokenAddress(contracts, input.paymentToken);
  const referrer = yield* referrerOf(input.referrer);

  const registrar = { address: contracts.registrar, abi: Abis.v2.ethRegistrar } as const;
  const quotes = Effect.forEach(
    names,
    (name) =>
      Effect.all(
        {
          available: Rpc.readContract(client, {
            ...registrar,
            functionName: "isAvailable",
            args: [name.label],
          }),
          valid: Rpc.readContract(client, {
            address: contracts.oracle,
            abi: Abis.v2.standardRentPriceOracle,
            functionName: "isValid",
            args: [name.label],
          }),
          price: Rpc.readContractOrUndefined(client, {
            ...registrar,
            functionName: "getRegisterPrice",
            args: [name.label, input.duration, token],
          }),
        },
        { concurrency: "unbounded" },
      ),
    { concurrency: "unbounded" },
  );
  const { quoted, minDuration, minCommitmentAge, maxCommitmentAge, now } = yield* Effect.all(
    {
      quoted: quotes,
      accepted: requirePaymentToken(client, contracts, token),
      minDuration: Rpc.readContract(client, {
        ...registrar,
        functionName: "MIN_REGISTER_DURATION",
      }),
      minCommitmentAge: Rpc.readContract(client, {
        ...registrar,
        functionName: "MIN_COMMITMENT_AGE",
      }),
      maxCommitmentAge: Rpc.readContract(client, {
        ...registrar,
        functionName: "MAX_COMMITMENT_AGE",
      }),
      now: Rpc.blockTimestamp(client, {}),
    },
    { concurrency: "unbounded" },
  );

  if (input.duration < minDuration) {
    return yield* Effect.fail(
      new InvalidInputError({ code: "DURATION_TOO_SHORT", input: input.duration }),
    );
  }
  for (const [index, name] of names.entries()) {
    const quote = quoted[index];
    if (quote?.valid !== true) {
      return yield* Effect.fail(
        new InvalidInputError({
          code: "INVALID_NAME",
          input: name.name,
          shortMessage: `${name.name} cannot be registered (too short or not allowed).`,
        }),
      );
    }
    if (!quote.available) {
      return yield* Effect.fail(
        new NameStateError({
          code: "NAME_NOT_AVAILABLE",
          shortMessage: `${name.name} is not available.`,
        }),
      );
    }
  }

  const prepared = yield* Effect.forEach(
    names,
    (name, index) =>
      prepareName(client, {
        contracts,
        name,
        options,
        sender,
        referrer,
        duration: input.duration,
        price: (quoted[index]?.price ?? [0n, 0n]) as readonly [bigint, bigint],
      }),
    { concurrency: "unbounded" },
  );

  return {
    contracts,
    names: prepared,
    owner: options.owner,
    signer,
    secret: options.secret,
    duration: input.duration,
    subregistry: options.subregistry,
    referrer,
    token,
    total: prepared.reduce((sum, name) => sum + name.price.base + name.price.premium, 0n),
    records: options.records,
    ownedDeploy: owned?.deploy,
    explicitResolver: options.resolver ?? undefined,
    minCommitmentAge,
    maxCommitmentAge,
    now,
  };
});

/** Resolver, commitment and (when resuming) commitment time of one name. */
const prepareName = Effect.fnUntraced(function* (
  client: Client,
  context: {
    readonly contracts: RegistrationContracts;
    readonly name: EthName;
    readonly options: {
      readonly owner: Address;
      readonly subregistry: Address;
      readonly resolver: Address | null | undefined;
      readonly secret: Hex;
      readonly records: Omit<RecordWrites, "clear" | "pubkey"> | undefined;
    };
    readonly sender: Address;
    readonly referrer: Hex;
    readonly duration: bigint;
    readonly price: readonly [bigint, bigint];
  },
): Effect.fn.Return<PreparedName, AnyError> {
  const { contracts, name, options } = context;
  let resolver: Address = options.resolver ?? zeroAddress;
  let deploy: Plan.Call | undefined;

  if (options.resolver === undefined) {
    // The resolver address must be known for the commitment, so it is a CREATE2 proxy whose
    // salt comes from the secret: a resumed registration recomputes the same address.
    const deployment = yield* deployPermissionedResolver(client, {
      deployer: context.sender,
      owner: options.owner,
      salt: resolverSalt(options.secret, name.label),
      name,
      records: options.records,
    });
    resolver = deployment.address;
    deploy = deployment.call;
  }

  const commitment = makeCommitment({
    label: name.label,
    owner: options.owner,
    secret: options.secret,
    subregistry: options.subregistry,
    resolver,
    duration: context.duration,
    referrer: context.referrer,
  });

  // The commitment may already be on-chain (`registration.commit`, or an interrupted
  // registration); its resolver can only have been deployed if it was.
  const committedAt = yield* Rpc.readContract(client, {
    address: contracts.registrar,
    abi: Abis.v2.ethRegistrar,
    functionName: "commitmentAt",
    args: [commitment],
  });
  const deployed =
    committedAt !== 0n && deploy !== undefined ? yield* Rpc.hasCode(client, resolver) : false;

  return {
    ...name,
    commitment,
    resolver,
    deploy: deployed ? undefined : deploy,
    price: { base: context.price[0], premium: context.price[1] },
    committedAt,
  };
});
