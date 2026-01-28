// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { VRFConsumerBaseV2 } from "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import { VRFCoordinatorV2Interface } from "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

contract RhinoLakeLottery is VRFConsumerBaseV2, Ownable {
    struct Round {
        uint256 startAt;
        uint256 endAt;
        uint256 ticketPriceBanda;
        uint256 ticketPriceUsdc;
        uint256 potUsdcInitial;
        uint256 potUsdcFromTickets;
        uint256 potUsdcTotal;
        uint256 totalTickets;
        address winner;
        uint256 requestId;
        bool settled;
    }

    struct TicketBucket {
        address buyer;
        uint256 cumulativeTickets;
    }

    IERC20 public immutable usdc;
    IERC20 public immutable banda;
    VRFCoordinatorV2Interface public immutable vrfCoordinator;
    address public treasury;

    uint256 public constant WEEK = 7 days;
    uint256 public constant MAX_TICKETS_PER_USER = 100;
    uint256 public constant USDC_FEE = 1e5; // $0.10 (6 decimals)

    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => uint256)) public ticketsByUser;
    mapping(uint256 => TicketBucket[]) internal ticketBuckets;
    mapping(uint256 => uint256) public requestToRound;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event RoundStarted(uint256 indexed roundId, uint256 startAt, uint256 endAt);
    event TicketsPurchased(uint256 indexed roundId, address indexed buyer, uint256 count, uint256 paymentRaw);
    event WinnerRequested(uint256 indexed roundId, uint256 requestId);
    event WinnerSelected(uint256 indexed roundId, address indexed winner, uint256 potUsdcTotal);
    event WinningsClaimed(uint256 indexed roundId, address indexed winner, uint256 amount);

    constructor(
        address usdcAddress,
        address bandaAddress,
        address treasuryAddress,
        address vrfCoordinatorAddress
    ) VRFConsumerBaseV2(vrfCoordinatorAddress) Ownable(treasuryAddress) {
        require(usdcAddress != address(0), "USDC required");
        require(bandaAddress != address(0), "BANDA required");
        require(treasuryAddress != address(0), "Treasury required");
        require(vrfCoordinatorAddress != address(0), "VRF required");
        usdc = IERC20(usdcAddress);
        banda = IERC20(bandaAddress);
        treasury = treasuryAddress;
        vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorAddress);
    }

    function setTreasury(address nextTreasury) external onlyOwner {
        require(nextTreasury != address(0), "Treasury required");
        treasury = nextTreasury;
    }

    function startNewRound(
        uint256 ticketPriceBanda,
        uint256 ticketPriceUsdc,
        uint256 potInitialUsdc
    ) external onlyOwner {
        if (currentRoundId != 0) {
            Round storage prior = rounds[currentRoundId];
            require(prior.settled || block.timestamp >= prior.endAt, "Prior round active");
        }
        currentRoundId += 1;
        Round storage round = rounds[currentRoundId];
        round.startAt = block.timestamp;
        round.endAt = block.timestamp + WEEK;
        round.ticketPriceBanda = ticketPriceBanda;
        round.ticketPriceUsdc = ticketPriceUsdc;
        round.potUsdcInitial = potInitialUsdc;
        round.potUsdcFromTickets = 0;
        round.potUsdcTotal = 0;
        round.totalTickets = 0;
        round.winner = address(0);
        round.requestId = 0;
        round.settled = false;

        if (potInitialUsdc > 0) {
            require(usdc.transferFrom(msg.sender, address(this), potInitialUsdc), "Seed transfer failed");
        }

        emit RoundStarted(currentRoundId, round.startAt, round.endAt);
    }

    function buyWithBanda(
        uint256 count,
        uint256 pricePerTicketBanda,
        uint256 usdcValuePerTicket
    ) external {
        Round storage round = rounds[currentRoundId];
        require(block.timestamp < round.endAt, "Round closed");
        require(count > 0, "Count required");
        require(pricePerTicketBanda > 0, "Price required");
        require(usdcValuePerTicket > 0, "USDC value required");
        require(ticketsByUser[currentRoundId][msg.sender] + count <= MAX_TICKETS_PER_USER, "Ticket cap reached");

        uint256 totalBanda = pricePerTicketBanda * count;
        require(banda.transferFrom(msg.sender, treasury, totalBanda), "BANDA transfer failed");

        ticketsByUser[currentRoundId][msg.sender] += count;
        round.potUsdcFromTickets += usdcValuePerTicket * count;
        _pushTickets(msg.sender, count, round);

        round.ticketPriceBanda = pricePerTicketBanda;
        round.ticketPriceUsdc = usdcValuePerTicket + USDC_FEE;

        emit TicketsPurchased(currentRoundId, msg.sender, count, totalBanda);
    }

    function buyWithUsdc(uint256 count, uint256 pricePerTicketUsdc) external {
        Round storage round = rounds[currentRoundId];
        require(block.timestamp < round.endAt, "Round closed");
        require(count > 0, "Count required");
        require(pricePerTicketUsdc >= USDC_FEE, "Price too low");
        require(ticketsByUser[currentRoundId][msg.sender] + count <= MAX_TICKETS_PER_USER, "Ticket cap reached");

        uint256 totalUsdc = pricePerTicketUsdc * count;
        uint256 baseUsdc = pricePerTicketUsdc - USDC_FEE;
        require(usdc.transferFrom(msg.sender, address(this), totalUsdc), "USDC transfer failed");
        if (USDC_FEE > 0) {
            require(usdc.transfer(treasury, USDC_FEE * count), "Fee transfer failed");
        }

        ticketsByUser[currentRoundId][msg.sender] += count;
        round.potUsdcFromTickets += baseUsdc * count;
        _pushTickets(msg.sender, count, round);

        round.ticketPriceUsdc = pricePerTicketUsdc;

        emit TicketsPurchased(currentRoundId, msg.sender, count, totalUsdc);
    }

    function requestWinner(
        bytes32 keyHash,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint16 requestConfirmations
    ) external onlyOwner returns (uint256 requestId) {
        Round storage round = rounds[currentRoundId];
        require(block.timestamp >= round.endAt, "Round active");
        require(round.requestId == 0, "Already requested");
        require(round.totalTickets > 0, "No tickets");

        requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            1
        );
        round.requestId = requestId;
        requestToRound[requestId] = currentRoundId;

        emit WinnerRequested(currentRoundId, requestId);
    }

    function closeRoundNoTickets() external onlyOwner {
        Round storage round = rounds[currentRoundId];
        require(block.timestamp >= round.endAt, "Round active");
        require(round.totalTickets == 0, "Tickets sold");
        require(!round.settled, "Already settled");
        uint256 potInitial = round.potUsdcInitial;
        round.potUsdcTotal = 0;
        round.settled = true;
        if (potInitial > 0) {
            require(usdc.transfer(treasury, potInitial), "Return failed");
        }
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        uint256 roundId = requestToRound[requestId];
        Round storage round = rounds[roundId];
        if (round.settled || round.totalTickets == 0) {
            return;
        }

        uint256 winningTicket = (randomWords[0] % round.totalTickets) + 1;
        address winner = _findWinner(roundId, winningTicket);
        round.winner = winner;
        round.settled = true;

        uint256 pot = round.potUsdcInitial + round.potUsdcFromTickets;
        uint256 balance = usdc.balanceOf(address(this));
        if (pot > balance) {
            pot = balance;
        }
        round.potUsdcTotal = pot;

        emit WinnerSelected(roundId, winner, pot);
    }

    function claimWinnings(uint256 roundId) external {
        Round storage round = rounds[roundId];
        require(round.settled, "Not settled");
        require(round.winner == msg.sender, "Not winner");
        require(!claimed[roundId][msg.sender], "Already claimed");
        claimed[roundId][msg.sender] = true;

        uint256 amount = round.potUsdcTotal;
        require(amount > 0, "No winnings");
        require(usdc.transfer(msg.sender, amount), "Payout failed");

        emit WinningsClaimed(roundId, msg.sender, amount);
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getTickets(uint256 roundId, address user) external view returns (uint256) {
        return ticketsByUser[roundId][user];
    }

    function isClaimed(uint256 roundId, address user) external view returns (bool) {
        return claimed[roundId][user];
    }

    function getBuckets(uint256 roundId) external view returns (TicketBucket[] memory) {
        return ticketBuckets[roundId];
    }

    function _pushTickets(address buyer, uint256 count, Round storage round) internal {
        uint256 cumulative = round.totalTickets + count;
        round.totalTickets = cumulative;
        ticketBuckets[currentRoundId].push(TicketBucket({ buyer: buyer, cumulativeTickets: cumulative }));
    }

    function _findWinner(uint256 roundId, uint256 winningTicket) internal view returns (address) {
        TicketBucket[] storage buckets = ticketBuckets[roundId];
        for (uint256 i = 0; i < buckets.length; i++) {
            if (winningTicket <= buckets[i].cumulativeTickets) {
                return buckets[i].buyer;
            }
        }
        return address(0);
    }
}
