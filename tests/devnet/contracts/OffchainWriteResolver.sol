// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @notice An ENSIP-10 resolver that keeps its records off-chain: it declares the record profiles
/// but refuses every write, in the way the selected mode picks (EIP-3668, ERC-5559, ERC-7884, or a
/// revert without a reason). Point a name at it; ensforge must say the records are off-chain.
contract OffchainWriteResolver {
    enum Mode {
        OffchainLookup,
        StorageHandledByL2,
        StorageHandledByOffChainDatabase,
        OperationHandledOnchain,
        OperationHandledOffchain,
        EmptyRevert
    }

    // ERC-5559.
    struct domainData {
        string name;
        string version;
        uint64 chainId;
        address verifyingContract;
    }
    struct parameter {
        string name;
        string value;
    }
    struct messageData {
        bytes4 functionSelector;
        address sender;
        parameter[] parameters;
        uint256 expirationTimestamp;
    }
    error StorageHandledByL2(uint256 chainId, address contractAddress);
    error StorageHandledByOffChainDatabase(domainData sender, string url, messageData data);

    // ERC-7884.
    struct DomainData {
        string name;
        string version;
        uint64 chainId;
        address verifyingContract;
    }
    struct MessageData {
        bytes data;
        address sender;
        uint256 expirationTimestamp;
    }
    error OperationHandledOnchain(uint256 chainId, address contractAddress);
    error OperationHandledOffchain(DomainData sender, string url, MessageData data);

    // EIP-3668.
    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    string public constant url = "https://gateway.example/records";
    /// A client that follows the lookup needs no server.
    string public constant lookupUrl = 'data:application/json,{"data":"0x"}';
    uint256 public constant l2ChainId = 8453;

    Mode public mode;

    function setMode(Mode newMode) external {
        mode = newMode;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC-165
            interfaceId == 0x9061b923 || // IExtendedResolver
            interfaceId == 0x3b3b57de || // addr
            interfaceId == 0xf1cb7e06 || // addr(coinType)
            interfaceId == 0x59d1d43c || // text
            interfaceId == 0xbc1c58d1; // contenthash
    }

    /// Records are not read here; they are not on this chain.
    function resolve(bytes calldata, bytes calldata) external pure returns (bytes memory) {
        return "";
    }

    function recordVersions(bytes32) external pure returns (uint64) {
        return 0;
    }

    /// Every setter, and `multicall`, lands here.
    fallback() external {
        Mode current = mode;
        if (current == Mode.OffchainLookup) {
            string[] memory urls = new string[](1);
            urls[0] = lookupUrl;
            revert OffchainLookup(address(this), urls, msg.data, this.supportsInterface.selector, "");
        }
        if (current == Mode.StorageHandledByL2) {
            revert StorageHandledByL2(l2ChainId, address(this));
        }
        if (current == Mode.StorageHandledByOffChainDatabase) {
            revert StorageHandledByOffChainDatabase(
                domainData("OffchainWriteResolver", "1", uint64(block.chainid), address(this)),
                url,
                messageData(bytes4(msg.data), msg.sender, new parameter[](0), block.timestamp + 600)
            );
        }
        if (current == Mode.OperationHandledOnchain) {
            revert OperationHandledOnchain(l2ChainId, address(this));
        }
        if (current == Mode.OperationHandledOffchain) {
            revert OperationHandledOffchain(
                DomainData("OffchainWriteResolver", "1", uint64(block.chainid), address(this)),
                url,
                MessageData(msg.data, msg.sender, block.timestamp + 600)
            );
        }
        assembly {
            revert(0, 0)
        }
    }
}
