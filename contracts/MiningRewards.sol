// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract MiningRewards is Ownable, EIP712 {
    using SafeERC20 for IERC20;

    IERC20 public immutable rewardToken;
    address public signer;

    mapping(address => uint256) public nonces;

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address account,uint256 amount,uint256 nonce,uint256 deadline)");

    event SignerUpdated(address signer);
    event RewardClaimed(address indexed account, uint256 amount, uint256 nonce);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address owner_, address token_, address signer_)
        EIP712("RhinoLakeMiningRewards", "1")
        Ownable(owner_)
    {
        require(token_ != address(0), "INVALID_TOKEN");
        require(signer_ != address(0), "INVALID_SIGNER");
        rewardToken = IERC20(token_);
        signer = signer_;
    }

    function setSigner(address signer_) external onlyOwner {
        require(signer_ != address(0), "INVALID_SIGNER");
        signer = signer_;
        emit SignerUpdated(signer_);
    }

    function claim(
        address account,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(account != address(0), "INVALID_ACCOUNT");
        require(amount > 0, "INVALID_AMOUNT");
        require(block.timestamp <= deadline, "CLAIM_EXPIRED");

        uint256 current = nonces[account];
        require(nonce == current, "INVALID_NONCE");
        nonces[account] = current + 1;

        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, account, amount, nonce, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);
        require(recovered == signer, "INVALID_SIGNATURE");

        rewardToken.safeTransfer(account, amount);
        emit RewardClaimed(account, amount, nonce);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "INVALID_TO");
        rewardToken.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }
}
