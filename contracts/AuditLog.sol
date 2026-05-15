// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AuditLog {

    struct Log {
        address buyer;
        address seller;
        uint256 amount;
        uint256 timestamp;
    }

    mapping(uint256 => Log) public logs;
    uint256 public nextId;

    event TradeLogged(
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 timestamp
    );

    function logTrade(address buyer, address seller, uint256 amount) external {
        logs[nextId] = Log(buyer, seller, amount, block.timestamp);
        emit TradeLogged(buyer, seller, amount, block.timestamp);
        nextId++;
    }

    function getAllLogs() external view returns (Log[] memory) {
        Log[] memory out = new Log[](nextId);
        for (uint256 i = 0; i < nextId; i++) {
            out[i] = logs[i];
        }
        return out;
    }
}
