// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./EnergyToken.sol";
import "./EcoRewards.sol";
import "./AuditLog.sol";

contract EnergyTrading {
    EnergyToken public energyToken;
    EcoRewards public rewardToken;
    AuditLog public logger;
    address public owner;
    event RewardGiven(address indexed user, uint256 amount); 

    mapping(address => uint256) public energyUsage; // Records department usage
    address[] public users; // List of participating users

    struct Order {
        address user;
        uint256 amount;
        uint256 timestamp;
        bool fulfilled;
    }

    Order[] public buyOrders;
    Order[] public sellOrders;

    constructor(address _energyToken, address _rewardToken, address _logger) {
        energyToken = EnergyToken(_energyToken);
        rewardToken = EcoRewards(_rewardToken);
        logger = AuditLog(_logger);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    function setEnergyUsage(address user, uint256 units) public onlyOwner {
        if (energyUsage[user] == 0) {
            users.push(user);
        }
        energyUsage[user] = units;
    }

    function rewardLowestUser() public onlyOwner {
    require(users.length > 0, "No users available");

    address lowestUser = users[0];
    uint256 lowestUsage = energyUsage[lowestUser];

    for (uint i = 1; i < users.length; i++) {
        if (energyUsage[users[i]] < lowestUsage) {
            lowestUsage = energyUsage[users[i]];
            lowestUser = users[i];
        }
    }

    uint256 rewardAmount = 100 * 10 ** rewardToken.decimals();
    rewardToken.mint(lowestUser, rewardAmount);

    emit RewardGiven(lowestUser, rewardAmount); // ✅ Add this line
    }


    function postBuyOrder(uint256 amount, uint256 timestamp) external {
        buyOrders.push(Order(msg.sender, amount, timestamp, false));
    }

    function postSellOffer(uint256 amount, uint256 timestamp) external {
        sellOrders.push(Order(msg.sender, amount, timestamp, false));
    }

    function confirmTrade(uint256 buyIndex, uint256 sellIndex) external {
        Order storage buyOrder = buyOrders[buyIndex];
        Order storage sellOrder = sellOrders[sellIndex];

        require(!buyOrder.fulfilled && !sellOrder.fulfilled, "Order already fulfilled");
        require(buyOrder.amount == sellOrder.amount, "Amount mismatch");
        require(buyOrder.timestamp == sellOrder.timestamp, "Time mismatch");

        require(energyToken.transferFrom(buyOrder.user, sellOrder.user, sellOrder.amount), "Transfer failed");
        logger.logTrade(buyOrder.user, sellOrder.user, sellOrder.amount);

        buyOrder.fulfilled = true;
        sellOrder.fulfilled = true;
    }

    function matchOrders() external onlyOwner {
        for (uint i = 0; i < buyOrders.length; i++) {
            if (buyOrders[i].fulfilled) continue;
            for (uint j = 0; j < sellOrders.length; j++) {
                if (sellOrders[j].fulfilled) continue;

                if (
                    buyOrders[i].amount == sellOrders[j].amount &&
                    buyOrders[i].timestamp == sellOrders[j].timestamp
                ) {
                    this.confirmTrade(i, j);
                    break;
                }
            }
        }
    }

    function getUsers() public view returns (address[] memory) {
        return users;
    }

    function getEnergyUsage(address user) public view returns (uint256) {
        return energyUsage[user];
    }

    function getBuyOrders() public view returns (Order[] memory) {
        return buyOrders;
    }

    function getSellOrders() public view returns (Order[] memory) {
        return sellOrders;
    }
}
