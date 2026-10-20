// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MergePay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable usdc;

    enum BountyState {
        Funded,
        Released,
        Refunded
    }

    struct Bounty {
        address funder;
        address recipient;
        uint256 amount;
        uint64 expiresAt;
        bytes32 repositoryHash;
        uint256 issueNumber;
        BountyState state;
    }

    mapping(uint256 => Bounty) public bounties;
    uint256 public bountyCount;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed funder,
        address indexed recipient,
        uint256 amount,
        uint64 expiresAt,
        bytes32 repositoryHash,
        uint256 issueNumber
    );
    event BountyReleased(uint256 indexed bountyId, address indexed recipient, uint256 amount, bytes32 pullRequestHash);
    event BountyRefunded(uint256 indexed bountyId, address indexed funder, uint256 amount);

    error ZeroAddress();
    error SelfRecipient();
    error ZeroAmount();
    error InvalidExpiry();
    error InvalidIssueNumber();
    error InvalidRepositoryHash();
    error BountyNotFound();
    error NotFunder();
    error WrongState();
    error NotExpired();
    error AlreadyExpiredOrExpiring();
    error TransferFailed();
    error BalanceMismatch();

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = _usdc;
    }

    function createBounty(
        address recipient,
        uint256 amount,
        uint64 expiresAt,
        bytes32 repositoryHash,
        uint256 issueNumber
    ) external returns (uint256 bountyId) {
        if (recipient == address(0)) revert ZeroAddress();
        if (recipient == msg.sender) revert SelfRecipient();
        if (amount == 0) revert ZeroAmount();
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        if (repositoryHash == bytes32(0)) revert InvalidRepositoryHash();
        if (issueNumber == 0) revert InvalidIssueNumber();

        bountyId = ++bountyCount;

        IERC20 token = IERC20(usdc);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));

        if (balanceAfter < balanceBefore || (balanceAfter - balanceBefore) != amount) {
            revert BalanceMismatch();
        }

        bounties[bountyId] = Bounty({
            funder: msg.sender,
            recipient: recipient,
            amount: amount,
            expiresAt: expiresAt,
            repositoryHash: repositoryHash,
            issueNumber: issueNumber,
            state: BountyState.Funded
        });

        emit BountyCreated(bountyId, msg.sender, recipient, amount, expiresAt, repositoryHash, issueNumber);
    }

    function release(uint256 bountyId, bytes32 pullRequestHash) external nonReentrant {
        if (bountyId == 0 || bountyId > bountyCount) revert BountyNotFound();

        Bounty storage bounty = bounties[bountyId];
        if (msg.sender != bounty.funder) revert NotFunder();
        if (bounty.state != BountyState.Funded) revert WrongState();
        if (block.timestamp >= bounty.expiresAt) revert AlreadyExpiredOrExpiring();

        bounty.state = BountyState.Released;

        address recipient = bounty.recipient;
        uint256 amount = bounty.amount;
        IERC20(usdc).safeTransfer(recipient, amount);

        emit BountyReleased(bountyId, recipient, amount, pullRequestHash);
    }

    function refund(uint256 bountyId) external nonReentrant {
        if (bountyId == 0 || bountyId > bountyCount) revert BountyNotFound();

        Bounty storage bounty = bounties[bountyId];
        if (msg.sender != bounty.funder) revert NotFunder();
        if (bounty.state != BountyState.Funded) revert WrongState();
        if (block.timestamp < bounty.expiresAt) revert NotExpired();

        bounty.state = BountyState.Refunded;

        address funder = bounty.funder;
        uint256 amount = bounty.amount;
        IERC20(usdc).safeTransfer(funder, amount);

        emit BountyRefunded(bountyId, funder, amount);
    }
}
