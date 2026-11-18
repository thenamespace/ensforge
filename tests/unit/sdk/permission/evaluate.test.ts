import { assert, describe, it } from "@effect/vitest";

import { Roles } from "@ensforge/contracts";
import type {
  Operation,
  PermissionCheck,
} from "@ensforge/sdk/internal/actions/permission/get/types";
import type { LoadedName } from "@ensforge/sdk/internal/internal/name/load";
import {
  evaluate,
  evaluateChildRewrite,
  evaluateSelfRemoval,
} from "@ensforge/sdk/internal/internal/permission/evaluate";
import type { PermissionFacts } from "@ensforge/sdk/internal/internal/permission/facts";
import * as Fuse from "@ensforge/sdk/internal/utils/Fuse";
import type { Address } from "viem";

const me: Address = "0x0000000000000000000000000000000000000001";
const owner: Address = "0x0000000000000000000000000000000000000002";
const registry: Address = "0x0000000000000000000000000000000000000003";
const subregistry: Address = "0x0000000000000000000000000000000000000004";
const resolver: Address = "0x0000000000000000000000000000000000000005";
const wrapper: Address = "0x0000000000000000000000000000000000000006";
const registrar: Address = "0x0000000000000000000000000000000000000007";
const ensRegistry: Address = "0x0000000000000000000000000000000000000008";
const contracts = { registry: ensRegistry, baseRegistrar: registrar, nameWrapper: wrapper };

type Overrides = {
  readonly protocol?: "v1" | "v2";
  readonly status?: string;
  readonly wrapped?: boolean;
  readonly isEth2ld?: boolean;
  readonly owner?: Address | null;
  readonly registrant?: Address | null;
  readonly manager?: Address | null;
  readonly fuses?: number;
  readonly subregistry?: Address | null;
  readonly v1?: Partial<PermissionFacts["v1"]>;
  readonly v2?: Partial<PermissionFacts["v2"]>;
  readonly resolver?: PermissionFacts["resolver"];
};

const factsOf = (o: Overrides = {}): PermissionFacts =>
  ({
    account: me,
    loaded: {
      state: {
        status: o.status ?? "registered",
        protocol: o.protocol ?? "v2",
        wrapped: o.wrapped ?? false,
        owner: o.owner === undefined ? me : o.owner,
        registrant: o.registrant === undefined ? me : o.registrant,
        registry,
        resource: 7n,
        subregistry: o.subregistry ?? null,
      },
      data: {
        parts: { isEth2ld: o.isEth2ld ?? true },
        v1: {
          registryOwner: o.manager === undefined ? me : o.manager,
          wrapper: { fuses: o.fuses ?? 0 },
        },
      },
    },
    v1: {
      registryOperator: false,
      registrarOperator: false,
      registrarApproved: null,
      wrapperOperator: false,
      wrapperApproved: null,
      parentOwner: null,
      parentApproved: null,
      canExtendSubnames: false,
      canModifyName: false,
      ...o.v1,
    },
    v2: {
      roles: 0n,
      rootRoles: 0n,
      rootOnlyRenewal: false,
      ownerRoles: Roles.registry.canTransferAdmin,
      ownerOnlyAssignee: true,
      registryEmancipated: true,
      operator: false,
      subregistryRoles: null,
      ...o.v2,
    },
    resolver: o.resolver,
  }) as unknown as PermissionFacts;

/** What `evaluate` says about `operation`, in one comparable line. */
const check = (overrides: Overrides, operation: Operation, withContracts = true) => {
  return describeCheck(
    evaluate(factsOf(overrides), operation, withContracts ? contracts : undefined),
  );
};

const describeCheck = (result: PermissionCheck) => {
  if (result.allowed === true) return `allowed via ${result.via}`;
  if (result.allowed === null) return "unknown";

  const missing = result.missing.map((requirement) => {
    if (requirement.type === "blocked") return `blocked ${requirement.reason}`;
    if (requirement.type === "roles")
      return `roles ${requirement.roles.join("+")} on ${requirement.contract}`;
    return `${requirement.type} ${"owner" in requirement ? requirement.owner : ""} on ${requirement.contract}`;
  });
  return `denied: ${missing.join(", ")}`;
};

const wrappedChild = (fuses = 0) =>
  ({ state: { wrapped: true }, data: { v1: { wrapper: { fuses } } } }) as unknown as LoadedName;
const unwrappedChild = { state: { wrapped: false }, data: {} } as unknown as LoadedName;

const rewrite = (parent: Overrides, child: LoadedName) =>
  describeCheck(evaluateChildRewrite(factsOf(parent), child, contracts));

const removal = (child: Overrides) => describeCheck(evaluateSelfRemoval(factsOf(child), contracts));

const permissioned = (roles: { root?: bigint; resource?: Map<bigint, bigint> } = {}) => ({
  address: resolver,
  kind: "permissioned" as const,
  rootRoles: roles.root ?? 0n,
  resourceRoles: roles.resource ?? new Map(),
  owner: null,
  operator: undefined,
  delegate: undefined,
  nameKnown: true,
  frozen: false,
});

const nodeBased = (overrides: Partial<NonNullable<PermissionFacts["resolver"]>> = {}) => ({
  address: resolver,
  kind: "node" as const,
  rootRoles: 0n,
  resourceRoles: new Map(),
  owner: me,
  operator: false,
  delegate: false,
  nameKnown: true,
  frozen: false,
  ...overrides,
});

describe("evaluate", () => {
  it("allows nothing on a name that is not registered, but renewing in grace", () => {
    assert.strictEqual(check({ status: "expired" }, "transfer"), "denied: blocked status");
    assert.strictEqual(check({ status: "grace" }, "transfer"), "denied: blocked status");
    assert.strictEqual(check({ status: "grace" }, "renew"), "allowed via anyone");
    assert.strictEqual(check({ status: "available" }, "renew"), "denied: blocked status");
  });

  describe("ENSv2", () => {
    it("transfers by the owner or an operator, while the token may move safely", () => {
      assert.strictEqual(check({}, "transfer"), "allowed via owner");
      assert.strictEqual(check({ owner }, "transfer"), `denied: owner ${owner} on ${registry}`);
      assert.strictEqual(
        check({ owner, v2: { operator: true } }, "transfer"),
        "allowed via operator",
      );
      assert.strictEqual(
        check({ v2: { ownerRoles: 0n } }, "transfer"),
        "denied: blocked transfer-disallowed",
      );
      assert.strictEqual(
        check({ v2: { ownerOnlyAssignee: false } }, "transfer"),
        "denied: blocked transfer-disallowed",
      );
      // TransferUnsafeUntilRegistryIsEmancipated: someone holds unemancipated root roles.
      assert.strictEqual(
        check({ v2: { registryEmancipated: false } }, "transfer"),
        "denied: blocked transfer-disallowed",
      );
    });

    it("sets resolvers and subregistries with the matching role", () => {
      for (const operation of ["setResolver", "setSubregistry"] as const) {
        assert.strictEqual(check({}, operation), `denied: roles ${operation} on ${registry}`);
        assert.strictEqual(
          check({ v2: { roles: Roles.registry[operation] } }, operation),
          "allowed via roles",
        );
      }
      // Another role is not enough.
      assert.strictEqual(
        check({ v2: { roles: Roles.registry.setSubregistry } }, "setResolver"),
        `denied: roles setResolver on ${registry}`,
      );
    });

    it("creates subnames with the registrar role, attaching a subregistry first when there is none", () => {
      assert.strictEqual(check({}, "createSubname"), `denied: roles setSubregistry on ${registry}`);
      assert.strictEqual(
        check({ v2: { roles: Roles.registry.setSubregistry } }, "createSubname"),
        "allowed via roles",
      );
      assert.strictEqual(
        check({ subregistry, v2: { subregistryRoles: 0n } }, "createSubname"),
        `denied: roles registrar on ${subregistry}`,
      );
      assert.strictEqual(
        check({ subregistry, v2: { subregistryRoles: Roles.registry.registrar } }, "createSubname"),
        "allowed via roles",
      );
    });

    it("removes subnames with the unregister role on the subregistry", () => {
      assert.strictEqual(check({}, "removeSubname"), "denied: blocked unsupported");
      assert.strictEqual(
        check({ subregistry, v2: { subregistryRoles: Roles.registry.registrar } }, "removeSubname"),
        `denied: roles unregister on ${subregistry}`,
      );
      assert.strictEqual(
        check(
          { subregistry, v2: { subregistryRoles: Roles.registry.unregister } },
          "removeSubname",
        ),
        "allowed via roles",
      );
    });

    it("renews .eth names for anyone, and other names with the renew role", () => {
      assert.strictEqual(check({ owner }, "renew"), "allowed via anyone");
      assert.strictEqual(check({ isEth2ld: false }, "renew"), `denied: roles renew on ${registry}`);
      assert.strictEqual(
        check({ isEth2ld: false, v2: { roles: Roles.registry.renew } }, "renew"),
        "allowed via roles",
      );
    });

    // contracts-v2 #505: the current UserRegistry ignores `renew` on the name.
    it("renews names on the current UserRegistry only with the root renew role", () => {
      const onName = { roles: Roles.registry.renew, rootOnlyRenewal: true };
      assert.deepInclude(evaluate(factsOf({ isEth2ld: false, v2: onName }), "renew", contracts), {
        allowed: false,
        resource: 0n,
        missing: [{ type: "roles", contract: registry, resource: 0n, roles: ["renew"] }],
      });
      assert.strictEqual(
        check({ isEth2ld: false, v2: { ...onName, rootRoles: Roles.registry.renew } }, "renew"),
        "allowed via roles",
      );
      assert.strictEqual(check({ v2: { rootOnlyRenewal: true } }, "renew"), "allowed via anyone");
    });

    it("revives an expired subname only with the root renew role", () => {
      const expired = {
        isEth2ld: false,
        status: "expired",
        v2: { roles: Roles.registry.renew },
      } as const;
      assert.strictEqual(check(expired, "renew"), `denied: roles renew on ${registry}`);
      assert.strictEqual(
        check({ ...expired, v2: { rootRoles: Roles.registry.renew } }, "renew"),
        "allowed via roles",
      );
      assert.strictEqual(check(expired, "setResolver"), "denied: blocked status");
    });

    it("has no TTL or manager", () => {
      for (const operation of ["setTtl", "setManager", "reclaim"] as const) {
        assert.strictEqual(check({}, operation), "denied: blocked unsupported");
      }
    });
  });

  describe("wrapped ENSv1", () => {
    const wrapped = { protocol: "v1", wrapped: true } as const;

    it("lets the owner or an operator act until a fuse is burned, not a token-approved account", () => {
      const guarded = {
        transfer: "cannotTransfer",
        setResolver: "cannotSetResolver",
        setTtl: "cannotSetTtl",
        createSubname: "cannotCreateSubdomain",
      } as const;
      for (const [operation, fuse] of Object.entries(guarded) as [
        keyof typeof guarded,
        Fuse.Name,
      ][]) {
        assert.strictEqual(check(wrapped, operation), "allowed via owner", operation);
        assert.strictEqual(
          check({ ...wrapped, owner }, operation),
          `denied: owner ${owner} on ${wrapper}`,
          operation,
        );
        assert.strictEqual(
          check({ ...wrapped, owner, v1: { wrapperOperator: true } }, operation),
          "allowed via operator",
        );
        // NameWrapper token approval only extends the name's children (canExtendSubnames).
        assert.strictEqual(
          check({ ...wrapped, owner, v1: { wrapperApproved: me } }, operation),
          `denied: owner ${owner} on ${wrapper}`,
          operation,
        );
        assert.strictEqual(
          check({ ...wrapped, fuses: Fuse.from([fuse]) }, operation),
          "denied: blocked fuse",
          operation,
        );
      }
    });

    it("removes subnames as the owner, whatever the fuses", () => {
      assert.strictEqual(
        check({ ...wrapped, fuses: Fuse.from(["cannotCreateSubdomain"]) }, "removeSubname"),
        "allowed via owner",
      );
      assert.strictEqual(
        check({ ...wrapped, owner }, "removeSubname"),
        `denied: owner ${owner} on ${wrapper}`,
      );
    });

    it("renews .eth names for anyone", () => {
      assert.strictEqual(check({ ...wrapped, owner }, "renew"), "allowed via anyone");
    });

    it("renews subnames through the parent, or as their owner with canExtendExpiry", () => {
      const sub = { ...wrapped, isEth2ld: false, owner } as const;
      const parent = { parentOwner: me, canExtendSubnames: true };
      assert.strictEqual(check({ ...sub, v1: parent }, "renew"), "allowed via owner");
      assert.strictEqual(
        check({ ...sub, v1: { ...parent, parentOwner: owner } }, "renew"),
        "allowed via operator",
      );
      assert.strictEqual(
        check({ ...sub, v1: { ...parent, parentOwner: owner, parentApproved: me } }, "renew"),
        "allowed via approved",
      );
      // A .eth parent in grace extends nothing.
      assert.strictEqual(
        check({ ...sub, v1: { parentOwner: me, canExtendSubnames: false } }, "renew"),
        "denied: blocked status",
      );
      assert.strictEqual(
        check({ ...sub, v1: { parentOwner: owner } }, "renew"),
        `denied: owner ${owner} on ${wrapper}`,
      );

      const extendable = { ...sub, owner: me, fuses: Fuse.from(["canExtendExpiry"]) };
      assert.strictEqual(
        check({ ...extendable, v1: { parentOwner: owner, canModifyName: true } }, "renew"),
        "allowed via owner",
      );
      assert.strictEqual(
        check({ ...extendable, owner, v1: { parentOwner: owner, canModifyName: true } }, "renew"),
        "allowed via operator",
      );
      // A token-approved account is not the child's own authority (canModifyName).
      assert.strictEqual(
        check({ ...extendable, owner, v1: { parentOwner: owner, wrapperApproved: me } }, "renew"),
        `denied: owner ${owner} on ${wrapper}`,
      );
      assert.strictEqual(
        check({ ...sub, owner: me, v1: { parentOwner: owner, canModifyName: true } }, "renew"),
        `denied: owner ${owner} on ${wrapper}`,
      );
    });

    it("renews an expired subname the parent still controls, not an emancipated one", () => {
      const expired = { ...wrapped, isEth2ld: false, status: "expired" } as const;
      const parent = { parentOwner: me, canExtendSubnames: true };
      assert.strictEqual(check({ ...expired, owner, v1: parent }, "renew"), "allowed via owner");
      assert.strictEqual(
        check({ ...expired, owner, v1: parent }, "setResolver"),
        "denied: blocked status",
      );
      assert.strictEqual(
        check({ ...expired, owner: null, v1: parent }, "renew"),
        "denied: blocked status",
      );
    });

    it("has no manager or subregistry", () => {
      for (const operation of ["setSubregistry", "setManager", "reclaim"] as const) {
        assert.strictEqual(check(wrapped, operation), "denied: blocked unsupported");
      }
    });
  });

  describe("unwrapped ENSv1", () => {
    const unwrapped = { protocol: "v1" } as const;

    it("transfers .eth names as the registrant and other names as the manager", () => {
      assert.strictEqual(check({ ...unwrapped, manager: owner }, "transfer"), "allowed via owner");
      assert.strictEqual(
        check({ ...unwrapped, registrant: owner }, "transfer"),
        `denied: owner ${owner} on ${registrar}`,
      );
      assert.strictEqual(
        check({ ...unwrapped, registrant: owner, v1: { registrarOperator: true } }, "transfer"),
        "allowed via operator",
      );
      assert.strictEqual(
        check({ ...unwrapped, registrant: owner, v1: { registrarApproved: me } }, "transfer"),
        "allowed via approved",
      );
      assert.strictEqual(
        check({ ...unwrapped, isEth2ld: false, manager: owner }, "transfer"),
        `denied: owner ${owner} on ${ensRegistry}`,
      );
    });

    it("sets resolvers, TTLs and subnames as the manager or a registry operator", () => {
      for (const operation of [
        "setResolver",
        "setTtl",
        "createSubname",
        "removeSubname",
      ] as const) {
        assert.strictEqual(check(unwrapped, operation), "allowed via owner");
        assert.strictEqual(
          check({ ...unwrapped, manager: owner }, operation),
          `denied: owner ${owner} on ${ensRegistry}`,
        );
        assert.strictEqual(
          check({ ...unwrapped, manager: owner, v1: { registryOperator: true } }, operation),
          "allowed via operator",
        );
      }
    });

    it("changes the manager as the manager, or as the registrant of a .eth name", () => {
      assert.strictEqual(
        check({ ...unwrapped, registrant: owner }, "setManager"),
        "allowed via owner",
      );
      assert.strictEqual(
        check({ ...unwrapped, manager: owner }, "setManager"),
        "allowed via owner",
      );
      assert.strictEqual(
        check({ ...unwrapped, manager: owner, registrant: owner }, "setManager"),
        `denied: owner ${owner} on ${registrar}`,
      );
      assert.strictEqual(
        check({ ...unwrapped, isEth2ld: false, manager: owner }, "setManager"),
        `denied: owner ${owner} on ${ensRegistry}`,
      );
    });

    it("reclaims and renews only .eth names", () => {
      assert.strictEqual(check({ ...unwrapped, manager: owner }, "reclaim"), "allowed via owner");
      assert.strictEqual(
        check({ ...unwrapped, isEth2ld: false }, "reclaim"),
        "denied: blocked unsupported",
      );
      assert.strictEqual(check({ ...unwrapped, registrant: owner }, "renew"), "allowed via anyone");
      assert.strictEqual(
        check({ ...unwrapped, isEth2ld: false }, "renew"),
        "denied: blocked unsupported",
      );
      assert.strictEqual(check(unwrapped, "setSubregistry"), "denied: blocked unsupported");
    });

    it("needs the deployment's ENSv1 contracts", () => {
      assert.strictEqual(check(unwrapped, "transfer", false), "denied: blocked unsupported");
    });
  });

  describe("records", () => {
    const text = { setRecord: "text", key: "url" } as const;

    it("needs a resolver", () => {
      assert.strictEqual(check({}, text), "denied: blocked unsupported");
    });

    it("checks PermissionedResolver roles at the root or on the record's resource", () => {
      assert.strictEqual(
        check({ resolver: permissioned() }, text),
        `denied: roles setText on ${resolver}`,
      );
      assert.strictEqual(
        check({ resolver: permissioned({ root: Roles.resolver.setText }) }, text),
        "allowed via roles",
      );
      assert.strictEqual(
        check({ resolver: permissioned({ root: Roles.resolver.setAddr }) }, text),
        `denied: roles setText on ${resolver}`,
      );
      const roles = {
        address: "setAddr",
        contentHash: "setContenthash",
        abi: "setAbi",
        name: "setName",
        interface: "setInterface",
        data: "setData",
        link: "link",
      } as const;
      for (const [setRecord, role] of Object.entries(roles)) {
        const operation = { setRecord } as Operation;
        assert.strictEqual(
          check({ resolver: permissioned({ root: Roles.resolver[role] }) }, operation),
          "allowed via roles",
          setRecord,
        );
        assert.strictEqual(
          check({ resolver: permissioned() }, operation),
          `denied: roles ${role} on ${resolver}`,
          setRecord,
        );
      }
      assert.strictEqual(
        check(
          { resolver: permissioned({ root: Roles.resolver.setText }) },
          { setRecord: "pubkey" },
        ),
        "denied: blocked unsupported",
      );
    });

    it("lets the owner, an operator or a delegate edit a node-based resolver", () => {
      assert.strictEqual(check({ resolver: nodeBased() }, text), "allowed via owner");
      assert.strictEqual(
        check({ resolver: nodeBased({ owner }) }, text),
        `denied: owner ${owner} on ${resolver}`,
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ owner, operator: true }) }, text),
        "allowed via operator",
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ owner, delegate: true }) }, text),
        "allowed via delegate",
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ operator: undefined, delegate: undefined }) }, text),
        "unknown",
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ frozen: true }) }, text),
        "denied: blocked unsupported",
      );
      assert.strictEqual(
        check({ resolver: nodeBased({ nameKnown: false }) }, text),
        "denied: blocked unsupported",
      );
    });
  });

  describe("subname rewrites and removals", () => {
    const emancipated = wrappedChild(Fuse.from(["parentCannotControl"]));

    it("rewrites children from an unwrapped parent in the registry, whatever their fuses", () => {
      const parent = { protocol: "v1" } as const;
      assert.strictEqual(rewrite(parent, emancipated), "allowed via owner");
      assert.strictEqual(
        rewrite({ ...parent, manager: owner, v1: { registryOperator: true } }, emancipated),
        "allowed via operator",
      );
      assert.strictEqual(
        rewrite({ ...parent, manager: owner }, unwrappedChild),
        `denied: owner ${owner} on ${ensRegistry}`,
      );
    });

    it("rewrites children of a wrapped parent as its owner or operator, unless emancipated", () => {
      const parent = { protocol: "v1", wrapped: true, owner } as const;
      assert.strictEqual(
        rewrite({ ...parent, v1: { wrapperOperator: true } }, wrappedChild()),
        "allowed via operator",
      );
      assert.strictEqual(
        rewrite({ ...parent, v1: { wrapperApproved: me } }, wrappedChild()),
        `denied: owner ${owner} on ${wrapper}`,
      );
      assert.strictEqual(rewrite({ ...parent, owner: me }, emancipated), "denied: blocked fuse");
    });

    it("removes a child as its own holder", () => {
      assert.strictEqual(
        removal({ v2: { roles: Roles.registry.unregister } }),
        "allowed via roles",
      );
      assert.strictEqual(removal({}), `denied: roles unregister on ${registry}`);

      const unwrapped = { protocol: "v1", isEth2ld: false } as const;
      assert.strictEqual(removal(unwrapped), "allowed via owner");
      assert.strictEqual(
        removal({ ...unwrapped, manager: owner, v1: { registryOperator: true } }),
        "allowed via operator",
      );
      assert.strictEqual(
        removal({ ...unwrapped, manager: owner }),
        `denied: owner ${owner} on ${ensRegistry}`,
      );
      assert.strictEqual(removal({ ...unwrapped, status: "expired" }), "denied: blocked status");
    });

    it("removes a wrapped child as its owner or operator, unless a fuse keeps it", () => {
      const wrapped = { protocol: "v1", wrapped: true, isEth2ld: false } as const;
      assert.strictEqual(removal(wrapped), "allowed via owner");
      assert.strictEqual(
        removal({ ...wrapped, owner, v1: { wrapperOperator: true } }),
        "allowed via operator",
      );
      assert.strictEqual(
        removal({ ...wrapped, owner, v1: { wrapperApproved: me } }),
        `denied: owner ${owner} on ${wrapper}`,
      );
      for (const fuse of [
        "cannotUnwrap",
        "cannotTransfer",
        "cannotSetResolver",
        "cannotSetTtl",
      ] as const) {
        assert.strictEqual(
          removal({ ...wrapped, fuses: Fuse.from([fuse]) }),
          "denied: blocked fuse",
          fuse,
        );
      }
    });
  });
});
