// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ICityNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function cityOf(address owner) external view returns (uint256);
    function mintCity(address to) external returns (uint256);
}

contract RhinoLakeGame is Ownable, ReentrancyGuard {
    IERC20 public immutable BAR;
    IERC20 public immutable RHINO_ERC20;
    ERC20Burnable public immutable RHINO_BURNABLE;
    ICityNFT public immutable CITY;

    struct CityState {
        uint256 barLocked;
        uint256 rhinoLocked;
        uint8 hits;        // 0..3
        bool dead;
        uint64 lastAttackAt;
    }

    mapping(uint256 => CityState) public cities;

    // Level thresholds (BAR locked)
    uint256[11] public levelBar; // index 0 => level 1

    // Attack params
    uint256 public attackCooldown = 10 minutes;
    uint256 public attackCostRhino = 0; // set after deploy

    // ETH rewards (weight = barLocked + rhinoLocked)
    uint256 public totalWeight;
    uint256 public accEthPerWeight; // scaled 1e18
    mapping(uint256 => uint256) public ethDebt;
    mapping(uint256 => uint256) public ethClaimable;

    event CityCreated(address indexed owner, uint256 indexed cityId);
    event BarLocked(uint256 indexed cityId, uint256 amount);
    event RhinoLocked(uint256 indexed cityId, uint256 amount);
    event CityLeveled(uint256 indexed cityId, uint8 newLevel);
    event Attacked(uint256 indexed attackerCityId, uint256 indexed defenderCityId, bool attackerWon);
    event CityDied(uint256 indexed cityId);
    event RewardDeposit(address indexed from, uint256 amount);
    event ClaimedEth(uint256 indexed cityId, uint256 amount);

    constructor(
        address owner_,
        address bar_,
        address rhino_,
        address cityNft_
    ) Ownable(owner_) {
        BAR = IERC20(bar_);
        RHINO_ERC20 = IERC20(rhino_);
        RHINO_BURNABLE = ERC20Burnable(rhino_);
        CITY = ICityNFT(cityNft_);

        // Your thresholds
        levelBar[0]  = 1_000_000;
        levelBar[1]  = 10_000_000;
        levelBar[2]  = 20_000_000;
        levelBar[3]  = 40_000_000;
        levelBar[4]  = 80_000_000;
        levelBar[5]  = 120_000_000;
        levelBar[6]  = 200_000_000;
        levelBar[7]  = 400_000_000;
        levelBar[8]  = 700_000_000;
        levelBar[9]  = 1_000_000_000;
        levelBar[10] = 10_000_000_000;
    }

    // --- Admin knobs ---
    function setAttackParams(uint256 _cooldown, uint256 _attackCostRhino) external onlyOwner {
        attackCooldown = _cooldown;
        attackCostRhino = _attackCostRhino;
    }

    // --- City creation ---
    function createCity() external returns (uint256 cityId) {
        require(CITY.cityOf(msg.sender) == 0, "ALREADY_HAS_CITY");
        cityId = CITY.mintCity(msg.sender);
        _syncEth(cityId);
        emit CityCreated(msg.sender, cityId);
    }

    function _onlyCityOwner(uint256 cityId) internal view {
        require(CITY.ownerOf(cityId) == msg.sender, "NOT_OWNER");
    }

    function levelOf(uint256 cityId) public view returns (uint8) {
        uint256 b = cities[cityId].barLocked;
        uint8 lvl = 0;
        for (uint8 i = 0; i < 11; i++) {
            if (b >= levelBar[i]) lvl = i + 1;
        }
        return lvl;
    }

    function weightOf(uint256 cityId) public view returns (uint256) {
        CityState memory c = cities[cityId];
        return c.barLocked + c.rhinoLocked;
    }

    // --- ETH rewards ---
    receive() external payable { _depositRewards(); }

    function depositRewards() external payable { _depositRewards(); }

    function _depositRewards() internal {
        require(totalWeight > 0, "NO_WEIGHT");
        accEthPerWeight += (msg.value * 1e18) / totalWeight;
        emit RewardDeposit(msg.sender, msg.value);
    }

    function _syncEth(uint256 cityId) internal {
        uint256 w = weightOf(cityId);
        uint256 accumulated = (w * accEthPerWeight) / 1e18;
        uint256 prev = ethDebt[cityId];
        if (accumulated > prev) {
            ethClaimable[cityId] += (accumulated - prev);
        }
        ethDebt[cityId] = accumulated;
    }

    function claimEth(uint256 cityId) external nonReentrant {
        _onlyCityOwner(cityId);
        _syncEth(cityId);

        uint256 amt = ethClaimable[cityId];
        require(amt > 0, "NOTHING");
        ethClaimable[cityId] = 0;

        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "ETH_SEND_FAIL");

        emit ClaimedEth(cityId, amt);
    }

    // --- Lock BAR (Power) ---
    function lockBAR(uint256 cityId, uint256 amount) external nonReentrant {
        _onlyCityOwner(cityId);
        require(!cities[cityId].dead, "CITY_DEAD");
        require(amount > 0, "AMOUNT");

        _syncEth(cityId);
        uint256 wBefore = weightOf(cityId);

        require(BAR.transferFrom(msg.sender, address(this), amount), "BAR_TRANSFER_FAIL");
        cities[cityId].barLocked += amount;

        uint256 wAfter = weightOf(cityId);
        totalWeight = totalWeight - wBefore + wAfter;
        ethDebt[cityId] = (wAfter * accEthPerWeight) / 1e18;

        emit BarLocked(cityId, amount);
        emit CityLeveled(cityId, levelOf(cityId));
    }

    // --- Lock RHINO (War strength) ---
    function lockRHINO(uint256 cityId, uint256 amount) external nonReentrant {
        _onlyCityOwner(cityId);
        require(!cities[cityId].dead, "CITY_DEAD");
        require(amount > 0, "AMOUNT");

        _syncEth(cityId);
        uint256 wBefore = weightOf(cityId);

        require(RHINO_ERC20.transferFrom(msg.sender, address(this), amount), "RHINO_TRANSFER_FAIL");
        cities[cityId].rhinoLocked += amount;

        uint256 wAfter = weightOf(cityId);
        totalWeight = totalWeight - wBefore + wAfter;
        ethDebt[cityId] = (wAfter * accEthPerWeight) / 1e18;

        emit RhinoLocked(cityId, amount);
    }

    // --- Attack (burn RHINO from attacker wallet as ammo) ---
    function attack(uint256 attackerCityId, uint256 defenderCityId) external nonReentrant {
        _onlyCityOwner(attackerCityId);

        CityState storage a = cities[attackerCityId];
        CityState storage d = cities[defenderCityId];

        require(!a.dead && !d.dead, "DEAD_CITY");
        require(attackerCityId != defenderCityId, "SAME");
        require(block.timestamp >= uint256(a.lastAttackAt) + attackCooldown, "COOLDOWN");

        // Ammo cost: burn RHINO from attacker wallet
        if (attackCostRhino > 0) {
            // user must approve this Game contract for RHINO first
            RHINO_BURNABLE.burnFrom(msg.sender, attackCostRhino);
        }

        a.lastAttackAt = uint64(block.timestamp);

        // v1 outcome: compare locked RHINO
        bool attackerWon = a.rhinoLocked > d.rhinoLocked;

        if (attackerWon) {
            d.hits += 1;
            if (d.hits >= 3) {
                d.dead = true;
                emit CityDied(defenderCityId);
            }
        }

        emit Attacked(attackerCityId, defenderCityId, attackerWon);
    }
}
