// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @notice Forwards every call to `target`. Placed at the ENS registry's mainnet address, it lets
/// contracts that read that address as a constant (Durin's L1Resolver) use the devnet's registry.
contract RegistryForwarder {
    address private immutable target;

    constructor(address target_) {
        target = target_;
    }

    fallback() external {
        address destination = target;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let success := call(gas(), destination, 0, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch success
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
