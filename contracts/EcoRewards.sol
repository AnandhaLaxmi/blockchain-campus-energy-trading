// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EcoRewards is ERC20, Ownable {
    address public minter;

    constructor(uint256 initialSupply, address initialOwner)
        ERC20("EcoRewards", "ECO")
        Ownable(initialOwner)
    {
        _mint(initialOwner, initialSupply * 10**decimals());
        minter = initialOwner;
    }

    function setMinter(address _m) external onlyOwner {
        minter = _m;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Not authorized");
        _mint(to, amount);
    }
}
