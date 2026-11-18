// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @notice An ENSIP-10 resolver that answers every query through an EIP-3668 gateway and returns
/// the gateway's answer unverified. It stands in for ENS's L2 reverse resolvers (`<coinType>.reverse`),
/// which read an L2 reverse registrar through a verifying gateway, so tests can serve L2 primary
/// names from an in-process gateway. Point a name at it and set the gateway with `setUrl`.
contract GatewayResolver {
    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    string private _url;

    function setUrl(string calldata url) external {
        _url = url;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        // ERC-165 and ENSIP-10 `IExtendedResolver`.
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x9061b923;
    }

    /// @notice The gateway receives this call's own calldata, `resolve(name, data)`.
    function resolve(bytes calldata, bytes calldata) external view returns (bytes memory) {
        string[] memory urls = new string[](1);
        urls[0] = _url;
        revert OffchainLookup(address(this), urls, msg.data, this.resolveCallback.selector, "");
    }

    function resolveCallback(
        bytes calldata response,
        bytes calldata
    ) external pure returns (bytes memory) {
        return response;
    }
}
