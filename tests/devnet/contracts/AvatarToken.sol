// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @notice The smallest token an ENSIP-12 avatar can point at: it answers the ERC-721 and
/// ERC-1155 reads avatar resolution makes, with metadata the devnet sets (a `data:` URL, so no
/// server is needed).
contract AvatarToken {
    mapping(uint256 id => address owner) public ownerOf;
    string private metadata;

    function setMetadata(string calldata uri_) external {
        metadata = uri_;
    }

    function mint(address to, uint256 id) external {
        ownerOf[id] = to;
    }

    function tokenURI(uint256) external view returns (string memory) {
        return metadata;
    }

    function uri(uint256) external view returns (string memory) {
        return metadata;
    }

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return ownerOf[id] == account ? 1 : 0;
    }
}
