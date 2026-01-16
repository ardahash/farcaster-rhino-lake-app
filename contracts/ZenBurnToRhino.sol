// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IRhinoTokenMint {
    function mint(address to, uint256 amount) external;
}

contract ZenBurnToRhino is Ownable {
    IERC20 public immutable ZEN;
    IRhinoTokenMint public immutable RHINO;

    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    uint256 public totalMinted; // RHINO minted (18d)
    uint256 public immutable maxMint;

    // Tier endpoints in RHINO units (18d), and RHINO-per-ZEN rates (18d)
    uint256[] public tierCaps;   // cumulative minted caps
    uint256[] public tierRates;  // RHINO per 1 ZEN (scaled 1e18)

    event Burned(address indexed user, uint256 zenAmount, uint256 rhinoMinted);

    constructor(
        address owner_,
        address zen_,
        address rhino_,
        uint256[] memory _tierCaps,
        uint256[] memory _tierRates
    ) Ownable(owner_) {
        require(_tierCaps.length == _tierRates.length, "BAD_TIERS");
        require(_tierCaps.length > 0, "NO_TIERS");

        ZEN = IERC20(zen_);
        RHINO = IRhinoTokenMint(rhino_);

        for (uint256 i = 0; i < _tierCaps.length; i++) {
            require(_tierCaps[i] > 0, "ZERO_CAP");
            require(_tierRates[i] > 0, "ZERO_RATE");
            if (i > 0) require(_tierCaps[i] > _tierCaps[i - 1], "CAP_ORDER");
        }

        maxMint = _tierCaps[_tierCaps.length - 1];
        tierCaps = _tierCaps;
        tierRates = _tierRates;
    }

    function tiersCount() external view returns (uint256) {
        return tierCaps.length;
    }

    function _currentTier() internal view returns (uint256) {
        uint256 m = totalMinted;
        for (uint256 i = 0; i < tierCaps.length; i++) {
            if (m < tierCaps[i]) return i;
        }
        return tierCaps.length - 1;
    }

    function currentRate() external view returns (uint256) {
        return tierRates[_currentTier()];
    }

    function burnZen(uint256 zenAmount) external {
        require(zenAmount > 0, "AMOUNT");
        require(totalMinted < maxMint, "CAP_REACHED");

        // burn ZEN
        require(ZEN.transferFrom(msg.sender, BURN, zenAmount), "ZEN_TRANSFER_FAIL");

        uint256 remainingZen = zenAmount;
        uint256 minted = 0;

        // Mint RHINO across tiers
        while (remainingZen > 0 && totalMinted < maxMint) {
            uint256 i = _currentTier();
            uint256 tierEnd = tierCaps[i];
            uint256 rate = tierRates[i]; // RHINO per 1 ZEN (18d)

            uint256 room = tierEnd - totalMinted; // RHINO remaining in this tier (18d)

            // zenFit = room / (rate RHINO per ZEN) => room * 1e18 / rate
            uint256 zenFit = (room * 1e18) / rate;

            if (zenFit == 0) {
                // tier too small to fit even 1 wei of ZEN at this rate
                totalMinted = tierEnd;
                continue;
            }

            uint256 zenUse = remainingZen < zenFit ? remainingZen : zenFit;

            // rhinoOut = zenUse * rate / 1e18
            uint256 rhinoOut = (zenUse * rate) / 1e18;

            remainingZen -= zenUse;
            totalMinted += rhinoOut;
            minted += rhinoOut;
        }

        require(minted > 0, "MINT_ZERO");
        RHINO.mint(msg.sender, minted);

        emit Burned(msg.sender, zenAmount, minted);
    }
}
