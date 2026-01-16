// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CityNFT is ERC721, Ownable {
    uint256 public nextId = 1;

    // v1: one city per wallet
    mapping(address => uint256) public cityOf;

    constructor(address owner_) ERC721("Rhino Lake City", "RLCITY") Ownable(owner_) {}

    function mintCity(address to) external onlyOwner returns (uint256 cityId) {
        require(cityOf[to] == 0, "ALREADY_HAS_CITY");
        cityId = nextId++;
        cityOf[to] = cityId;
        _safeMint(to, cityId);
    }
}
