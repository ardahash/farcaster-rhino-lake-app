// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PickaxeNFT is ERC1155, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_TOKEN_ID = 5;

    IERC20 public immutable usdc;
    address public immutable treasury;

    mapping(uint256 => uint256) public prices;

    constructor(address owner_, address usdc_, address treasury_) ERC1155("") Ownable(owner_) {
        require(usdc_ != address(0), "INVALID_USDC");
        require(treasury_ != address(0), "INVALID_TREASURY");

        usdc = IERC20(usdc_);
        treasury = treasury_;

        prices[1] = 5_000_000;
        prices[2] = 10_000_000;
        prices[3] = 15_000_000;
        prices[4] = 20_000_000;
        prices[5] = 50_000_000;
    }

    function buy(uint256 tokenId) external {
        _requireValidToken(tokenId);
        uint256 price = prices[tokenId];
        require(price > 0, "PRICE_NOT_SET");
        require(balanceOf(msg.sender, tokenId) == 0, "ALREADY_OWNED");

        usdc.safeTransferFrom(msg.sender, treasury, price);
        _mint(msg.sender, tokenId, 1, "");
    }

    function setPrice(uint256 tokenId, uint256 price) external onlyOwner {
        _requireValidToken(tokenId);
        prices[tokenId] = price;
    }

    function _requireValidToken(uint256 tokenId) internal pure {
        require(tokenId >= 1 && tokenId <= MAX_TOKEN_ID, "INVALID_TOKEN");
    }
}
