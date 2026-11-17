// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @notice Misbehaves on every call the way broken or malicious resolvers, registries and owners
/// do on mainnet, for the cases ENS's own mocks do not cover. Point a name's resolver (or an
/// owner) at it and pick a mode; ensforge must fail cleanly in each.
contract HostileContract {
    enum Mode {
        /// Reverts without data, e.g. a reverting `supportsInterface` or `owner()`.
        Revert,
        /// Burns all gas it is given.
        BurnGas,
        /// Returns `returnSize` zero bytes, e.g. a returndata bomb.
        ReturnLarge
    }

    Mode public mode;
    uint256 public returnSize = 1 << 20;

    function setMode(Mode newMode) external {
        mode = newMode;
    }

    function setReturnSize(uint256 size) external {
        returnSize = size;
    }

    fallback() external payable {
        Mode current = mode;
        if (current == Mode.BurnGas) {
            while (true) {}
        }
        if (current == Mode.ReturnLarge) {
            uint256 size = returnSize;
            assembly {
                return(0, size)
            }
        }
        assembly {
            revert(0, 0)
        }
    }
}
