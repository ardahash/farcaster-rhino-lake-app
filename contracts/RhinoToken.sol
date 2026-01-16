// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RhinoToken is ERC20, ERC20Burnable, Ownable {
    mapping(address => bool) public minters;
    uint256 public immutable MAX_SUPPLY; // 100b RHINO

    constructor(address owner_) ERC20("RHINO", "RHINO") Ownable(owner_) {
        MAX_SUPPLY = 100_000_000_000 * 1e18;
    }

    function setMinter(address minter, bool allowed) external onlyOwner {
        minters[minter] = allowed;
    }

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "NOT_MINTER");
        require(totalSupply() + amount <= MAX_SUPPLY, "MAX_SUPPLY");
        _mint(to, amount);
    }
}
