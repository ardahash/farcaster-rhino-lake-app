// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RhinoLakePlinko is Ownable {
    struct PendingPlay {
        bool active;
        uint8 risk;
        uint8 slot;
        uint32 multiplierBps;
        uint256 stake;
        uint256 payout;
        uint256 playedAt;
        uint256 nonce;
    }

    IERC20 public immutable usdc;

    uint8 public constant SLOT_COUNT = 9;
    uint16 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant STAKE_1 = 1_000_000;
    uint256 public constant STAKE_5 = 5_000_000;
    uint256 public constant STAKE_10 = 10_000_000;

    mapping(address => PendingPlay) private pendingPlays;
    mapping(address => uint256) public playCounts;

    event Played(
        address indexed player,
        uint256 indexed nonce,
        uint8 risk,
        uint256 stake,
        uint8 slot,
        uint32 multiplierBps,
        uint256 payout
    );
    event Claimed(address indexed player, uint256 indexed nonce, uint256 payout);
    event Discarded(address indexed player, uint256 indexed nonce);

    constructor(address usdcAddress, address ownerAddress) Ownable(ownerAddress) {
        require(usdcAddress != address(0), "USDC required");
        require(ownerAddress != address(0), "Owner required");
        usdc = IERC20(usdcAddress);
    }

    function play(uint8 risk, uint256 stake) external {
        require(risk <= 2, "Invalid risk");
        require(_isAllowedStake(stake), "Invalid stake");

        PendingPlay storage pending = pendingPlays[msg.sender];
        require(!pending.active, "Resolve current play");

        require(usdc.transferFrom(msg.sender, address(this), stake), "USDC transfer failed");

        uint256 nextNonce = playCounts[msg.sender] + 1;
        playCounts[msg.sender] = nextNonce;

        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1),
                    msg.sender,
                    nextNonce,
                    risk,
                    stake,
                    block.timestamp
                )
            )
        );

        uint8 slot = uint8(seed % SLOT_COUNT);
        uint32 multiplierBps = _multiplierFor(risk, slot);
        uint256 payout = (stake * multiplierBps) / BPS_DENOMINATOR;

        require(usdc.balanceOf(address(this)) >= payout, "Insufficient liquidity");

        pending.active = true;
        pending.risk = risk;
        pending.slot = slot;
        pending.multiplierBps = multiplierBps;
        pending.stake = stake;
        pending.payout = payout;
        pending.playedAt = block.timestamp;
        pending.nonce = nextNonce;

        emit Played(msg.sender, nextNonce, risk, stake, slot, multiplierBps, payout);
    }

    function claim() external {
        PendingPlay storage pending = pendingPlays[msg.sender];
        require(pending.active, "No pending play");

        uint256 payout = pending.payout;
        uint256 nonce = pending.nonce;
        pending.active = false;

        if (payout > 0) {
            require(usdc.transfer(msg.sender, payout), "Payout failed");
        }

        emit Claimed(msg.sender, nonce, payout);
    }

    function discard() external {
        PendingPlay storage pending = pendingPlays[msg.sender];
        require(pending.active, "No pending play");
        uint256 nonce = pending.nonce;
        pending.active = false;
        emit Discarded(msg.sender, nonce);
    }

    function pendingOf(address player)
        external
        view
        returns (
            bool active,
            uint8 risk,
            uint8 slot,
            uint32 multiplierBps,
            uint256 stake,
            uint256 payout,
            uint256 playedAt,
            uint256 nonce
        )
    {
        PendingPlay storage pending = pendingPlays[player];
        return (
            pending.active,
            pending.risk,
            pending.slot,
            pending.multiplierBps,
            pending.stake,
            pending.payout,
            pending.playedAt,
            pending.nonce
        );
    }

    function getMultipliers(uint8 risk) external pure returns (uint32[SLOT_COUNT] memory) {
        if (risk == 0) {
            return _lowMultipliers();
        }
        if (risk == 1) {
            return _mediumMultipliers();
        }
        return _highMultipliers();
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Recipient required");
        require(usdc.transfer(to, amount), "Withdraw failed");
    }

    function _isAllowedStake(uint256 stake) internal pure returns (bool) {
        return stake == STAKE_1 || stake == STAKE_5 || stake == STAKE_10;
    }

    function _multiplierFor(uint8 risk, uint8 slot) internal pure returns (uint32) {
        require(slot < SLOT_COUNT, "Invalid slot");
        if (risk == 0) {
            return _lowMultipliers()[slot];
        }
        if (risk == 1) {
            return _mediumMultipliers()[slot];
        }
        return _highMultipliers()[slot];
    }

    function _lowMultipliers() internal pure returns (uint32[SLOT_COUNT] memory) {
        return [uint32(5000), 7000, 9000, 10000, 12000, 10000, 9000, 7000, 5000];
    }

    function _mediumMultipliers() internal pure returns (uint32[SLOT_COUNT] memory) {
        return [uint32(0), 5000, 8000, 12000, 20000, 12000, 8000, 5000, 0];
    }

    function _highMultipliers() internal pure returns (uint32[SLOT_COUNT] memory) {
        return [uint32(0), 2000, 5000, 10000, 100000, 10000, 5000, 2000, 0];
    }
}
