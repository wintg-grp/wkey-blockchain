// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title  Multicall3
 * @author WINTG Team (port du standard mds1/multicall3)
 * @notice Batch d'appels read-only on-chain. Standard de l'industrie utilisé
 *         par tous les indexers, wallets et dApps EVM (Etherscan, Coingecko,
 *         Snapshot, MakerDAO, etc.).
 *
 *         **Adresse canonique attendue** : `0xcA11bde05977b3631167028862bE2a173976CA11`
 *         sur Mainnet, BNB, Polygon, etc. Pour respecter cette convention sur
 *         WINTG, déployer ce contrat depuis un wallet et un nonce produisant
 *         exactement cette adresse (CREATE2 avec un salt connu — voir
 *         https://github.com/mds1/multicall pour les détails).
 */
contract Multicall3 {
    struct Call {
        address target;
        bytes callData;
    }
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }
    struct Call3Value {
        address target;
        bool allowFailure;
        uint256 value;
        bytes callData;
    }
    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate(Call[] calldata calls) external returns (uint256 blockNumber, bytes[] memory returnData) {
        blockNumber = block.number;
        uint256 length = calls.length;
        returnData = new bytes[](length);
        for (uint256 i = 0; i < length; i++) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            require(success, "Multicall3: call failed");
            returnData[i] = ret;
        }
    }

    function tryAggregate(bool requireSuccess, Call[] calldata calls)
        external returns (Result[] memory returnData)
    {
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i = 0; i < length; i++) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            if (requireSuccess) require(success, "Multicall3: call failed");
            returnData[i] = Result({success: success, returnData: ret});
        }
    }

    function tryBlockAndAggregate(bool requireSuccess, Call[] calldata calls)
        public returns (uint256 blockNumber, bytes32 blockHash, Result[] memory returnData)
    {
        blockNumber = block.number;
        blockHash = blockhash(block.number);
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i = 0; i < length; i++) {
            (bool success, bytes memory ret) = calls[i].target.call(calls[i].callData);
            if (requireSuccess) require(success, "Multicall3: call failed");
            returnData[i] = Result({success: success, returnData: ret});
        }
    }

    function blockAndAggregate(Call[] calldata calls)
        external returns (uint256 blockNumber, bytes32 blockHash, Result[] memory returnData)
    {
        return tryBlockAndAggregate(true, calls);
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData) {
        uint256 length = calls.length;
        returnData = new Result[](length);
        Call3 calldata calli;
        for (uint256 i = 0; i < length; i++) {
            calli = calls[i];
            (bool success, bytes memory ret) = calli.target.call(calli.callData);
            if (!calli.allowFailure) require(success, "Multicall3: call failed");
            returnData[i] = Result({success: success, returnData: ret});
        }
    }

    function aggregate3Value(Call3Value[] calldata calls) external payable returns (Result[] memory returnData) {
        uint256 length = calls.length;
        returnData = new Result[](length);
        Call3Value calldata calli;
        uint256 valAccumulator;
        for (uint256 i = 0; i < length; i++) {
            calli = calls[i];
            valAccumulator += calli.value;
            (bool success, bytes memory ret) = calli.target.call{value: calli.value}(calli.callData);
            if (!calli.allowFailure) require(success, "Multicall3: call failed");
            returnData[i] = Result({success: success, returnData: ret});
        }
        require(msg.value == valAccumulator, "Multicall3: bad msg.value");
    }

    function getBlockHash(uint256 blockNumber) external view returns (bytes32) {
        return blockhash(blockNumber);
    }

    function getBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function getCurrentBlockCoinbase() external view returns (address) {
        return block.coinbase;
    }

    function getCurrentBlockGasLimit() external view returns (uint256) {
        return block.gaslimit;
    }

    function getCurrentBlockTimestamp() external view returns (uint256) {
        return block.timestamp;
    }

    function getEthBalance(address addr) external view returns (uint256) {
        return addr.balance;
    }

    function getLastBlockHash() external view returns (bytes32) {
        return blockhash(block.number - 1);
    }

    function getBasefee() external view returns (uint256) {
        return block.basefee;
    }

    function getChainId() external view returns (uint256) {
        return block.chainid;
    }
}
