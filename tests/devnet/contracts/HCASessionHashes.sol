// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

// Compiled as `project/test/HCASessionHashes.sol` with contracts-v2's validator build-info, so
// these imports are the pinned contracts-v2 sources.
import {HCAOwnerAndSessionValidator} from "../src/hca/HCAOwnerAndSessionValidator.sol";
import {HCASmartSessionLib} from "../src/hca/libraries/HCASmartSessionLib.sol";

/// @notice Exposes the session hashing of `HCAOwnerAndSessionValidator` and `HCASmartSessionLib`,
/// which are internal, so ensforge's session approvals can be checked against the contracts' own
/// code. It inherits the validator only to reach `_sessionAuthorizationSalt`; it validates nothing.
contract HCASessionHashes is HCAOwnerAndSessionValidator {
    constructor(address verifiableFactory)
        HCAOwnerAndSessionValidator(
            address(0),
            address(0),
            address(0),
            address(0),
            verifiableFactory,
            address(0),
            address(0)
        )
    {}

    /// @notice The salt binding a session's terms.
    function sessionAuthorizationSalt(SessionEnableProof calldata proof)
        external
        pure
        returns (bytes32)
    {
        return _sessionAuthorizationSalt(proof);
    }

    /// @notice The Smart Session permission id and signed-session digest of a session key.
    function authorizationHashes(address account, address sessionKey, bytes32 salt)
        external
        pure
        returns (bytes32 permissionId, bytes32 sessionDigest)
    {
        return HCASmartSessionLib.authorizationHashes(account, sessionKey, salt);
    }

    /// @notice The digest an owner signs to approve `sessions`, in order.
    function multiChainDigest(HCASmartSessionLib.HashAndChainId[] calldata sessions)
        external
        pure
        returns (bytes32)
    {
        bytes32[] memory chainSessionHashes = new bytes32[](sessions.length);
        for (uint256 i; i < sessions.length; ++i) {
            chainSessionHashes[i] =
                HCASmartSessionLib.chainSessionHash(sessions[i].chainId, sessions[i].sessionDigest);
        }
        return HCASmartSessionLib.multiChainDigest(chainSessionHashes);
    }

    /// @notice Checks an owner's multi-chain approval as the validator does when a session is
    /// enabled: `packedSessions` holds `bytes8 chainId ‖ bytes32 sessionDigest` entries.
    function validateMultiChainAuthorization(
        address expectedOwner,
        bytes32 expectedSessionDigest,
        uint256 selectedIndex,
        bytes calldata packedSessions,
        bytes calldata ownerSignature
    )
        external
        view
        returns (HCASmartSessionLib.AuthorizationStatus)
    {
        return HCASmartSessionLib.validateMultiChainAuthorization(
            expectedOwner, expectedSessionDigest, selectedIndex, packedSessions, ownerSignature
        );
    }
}
