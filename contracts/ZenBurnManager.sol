// SPDX-License-Identifier: MIT
// live on BASE mainnet at 0x89e273c05d6DdB3d54a8bd669FA4E2B2A857B90c 
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IRankNFT {
    function updateRank(address user, uint256 newTotalBurned) external;
}

/// @notice Manages ZEN burning on Base mainnet and upgrades soulbound rank NFTs.
contract ZenBurnManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable zen;
    uint8 public immutable zenDecimals;

    // canonical dead address for burns
    address public constant BURN_ADDRESS =
        0x000000000000000000000000000000000000dEaD;

    // 5% fee expressed in basis points
    uint16 public constant FEE_BPS = 500; // 500 / 10_000 = 5%
    uint256 public constant BASE_MAINNET_CHAIN_ID = 8453;

    address public treasury;
    IRankNFT public rankNft;

    // total amount of ZEN the user has actually burned (excludes fee)
    mapping(address => uint256) public totalBurned;

    event ZenBurned(
        address indexed user,
        uint256 burnAmount,
        uint256 feeAmount,
        uint256 newTotalBurned
    );
    event TreasuryChanged(address treasury);
    event RankNftChanged(address rankNft);

    error InvalidAmount();
    error TreasuryNotSet();
    error ZeroAddress();
    error UnsupportedChain(uint256 chainId);

    constructor(address _zen, address _treasury, address _rankNft) Ownable(msg.sender) {
        if (_zen == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        zen = IERC20(_zen);
        zenDecimals = IERC20Metadata(_zen).decimals();

        treasury = _treasury;
        rankNft = IRankNFT(_rankNft);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasuryChanged(_treasury);
    }

    function setRankNft(address _rankNft) external onlyOwner {
        // allow disabling by setting 0 address if you want:
        // require(_rankNft != address(0), "rank nft is zero");
        rankNft = IRankNFT(_rankNft);
        emit RankNftChanged(_rankNft);
    }

    /**
     * @notice Burn ZEN (95%) and send a 5% fee to the treasury.
     * Only callable on Base mainnet. Updates cumulative burn totals and mints/upgrades rank NFTs.
     */
    function burnZen(uint256 amount) external nonReentrant {
        if (block.chainid != BASE_MAINNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }
        if (amount == 0) revert InvalidAmount();
        if (treasury == address(0)) revert TreasuryNotSet();

        uint256 fee = (amount * FEE_BPS) / 10_000;
        uint256 burnAmount = amount - fee;

        // user must have approved this contract for at least `amount`
        zen.safeTransferFrom(msg.sender, BURN_ADDRESS, burnAmount);
        zen.safeTransferFrom(msg.sender, treasury, fee);

        uint256 newTotal = totalBurned[msg.sender] + burnAmount;
        totalBurned[msg.sender] = newTotal;

        emit ZenBurned(msg.sender, burnAmount, fee, newTotal);

        // poke RankNFT for upgrades, if present
        if (address(rankNft) != address(0)) {
            rankNft.updateRank(msg.sender, newTotal);
        }
    }

    // --- helpers for frontends ---

    /// @notice Convenience: convert whole-token amount to base units using zenDecimals
    function toBaseUnits(uint256 wholeTokens) external view returns (uint256) {
        return wholeTokens * (10 ** uint256(zenDecimals));
    }
}