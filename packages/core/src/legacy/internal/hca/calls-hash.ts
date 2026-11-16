import { encodeAbiParameters, keccak256 } from "viem";

import { type VerifiedHcaAccount } from "../../actions/hca/types.js";

export const hashHcaCalls = (
  account: Pick<VerifiedHcaAccount, "chainId" | "address" | "owner" | "initialImplementation">,
  data: `0x${string}`,
  value: bigint,
) =>
  keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "bytes" },
        { type: "uint256" },
      ],
      [
        BigInt(account.chainId),
        account.address,
        account.owner,
        account.initialImplementation,
        data,
        value,
      ],
    ),
  );
