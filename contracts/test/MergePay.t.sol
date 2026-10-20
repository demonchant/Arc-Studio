// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MergePay} from "../MergePay.sol";
import {MockERC20}    from "../test-helpers/MockERC20.sol";
import {FailingERC20} from "../test-helpers/FailingERC20.sol";

// ---------------------------------------------------------------------------
// MergePay unit + fuzz test suite
// ---------------------------------------------------------------------------
contract MergePayTest is Test {
    // -----------------------------------------------------------------------
    // Actors
    // -----------------------------------------------------------------------
    address internal funder    = makeAddr("funder");
    address internal recipient = makeAddr("recipient");
    address internal stranger  = makeAddr("stranger");

    // -----------------------------------------------------------------------
    // Tokens & contract under test
    // -----------------------------------------------------------------------
    MockERC20    internal usdc;
    FailingERC20 internal badToken;
    MergePay     internal mergePay;
    MergePay     internal mergePayBad; // backed by FailingERC20

    // -----------------------------------------------------------------------
    // Constants re-used across tests
    // -----------------------------------------------------------------------
    uint256 internal constant AMOUNT      = 100e6;          // 100 USDC
    uint64  internal constant FUTURE      = 2 days;         // offset from block.timestamp
    bytes32 internal constant REPO_HASH   = keccak256("org/repo");
    uint256 internal constant ISSUE_NUM   = 42;
    bytes32 internal constant PR_HASH     = keccak256("pr/1");

    // -----------------------------------------------------------------------
    // setUp — runs before every test
    // -----------------------------------------------------------------------
    function setUp() public {
        // Deploy normal mock USDC (no canonical address constant in MergePay,
        // so we pass the address as a constructor argument).
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy failing token
        badToken = new FailingERC20();

        // Deploy two MergePay instances
        mergePay    = new MergePay(address(usdc));
        mergePayBad = new MergePay(address(badToken));

        // Fund funder with enough USDC for all tests
        usdc.mint(funder, 1_000_000e6);

        // Approve mergePay to pull from funder
        vm.prank(funder);
        usdc.approve(address(mergePay), type(uint256).max);

        // Fund funder on the bad-token instance
        badToken.mint(funder, 1_000_000e6);
        vm.prank(funder);
        badToken.approve(address(mergePayBad), type(uint256).max);
    }

    // -----------------------------------------------------------------------
    // Internal helper: create a standard bounty and return its id
    // -----------------------------------------------------------------------
    function _createBounty() internal returns (uint256 bountyId) {
        vm.prank(funder);
        bountyId = mergePay.createBounty(
            recipient,
            AMOUNT,
            uint64(block.timestamp) + uint64(FUTURE),
            REPO_HASH,
            ISSUE_NUM
        );
    }

    // -----------------------------------------------------------------------
    // 1. Constructor
    // -----------------------------------------------------------------------

    function test_Constructor_RevertsOnZeroUSDC() public {
        vm.expectRevert(MergePay.ZeroAddress.selector);
        new MergePay(address(0));
    }

    function test_Constructor_StoresUSDCAddress() public view {
        assertEq(mergePay.usdc(), address(usdc));
    }

    // -----------------------------------------------------------------------
    // 2. createBounty — happy path & field storage
    // -----------------------------------------------------------------------

    function test_CreateBounty_StoresAllFields() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);

        vm.prank(funder);
        uint256 bountyId = mergePay.createBounty(
            recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM
        );

        assertEq(bountyId, 1, "bountyId should be 1");
        assertEq(mergePay.bountyCount(), 1, "bountyCount should increment");

        (
            address storedFunder,
            address storedRecipient,
            uint256 storedAmount,
            uint64  storedExpiry,
            bytes32 storedRepoHash,
            uint256 storedIssueNum,
            MergePay.BountyState storedState
        ) = mergePay.bounties(bountyId);

        assertEq(storedFunder,    funder,                  "funder mismatch");
        assertEq(storedRecipient, recipient,               "recipient mismatch");
        assertEq(storedAmount,    AMOUNT,                  "amount mismatch");
        assertEq(storedExpiry,    expiresAt,               "expiresAt mismatch");
        assertEq(storedRepoHash,  REPO_HASH,               "repositoryHash mismatch");
        assertEq(storedIssueNum,  ISSUE_NUM,               "issueNumber mismatch");
        assertEq(uint8(storedState), uint8(MergePay.BountyState.Funded), "state should be Funded");
    }

    function test_CreateBounty_EmitsBountyCreated() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);

        vm.expectEmit(true, true, true, true, address(mergePay));
        emit MergePay.BountyCreated(1, funder, recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);
    }

    function test_CreateBounty_TransferAccountingExact() public {
        uint256 funderBefore   = usdc.balanceOf(funder);
        uint256 contractBefore = usdc.balanceOf(address(mergePay));

        _createBounty();

        uint256 funderAfter   = usdc.balanceOf(funder);
        uint256 contractAfter = usdc.balanceOf(address(mergePay));

        assertEq(funderBefore - funderAfter,   AMOUNT, "funder should lose exactly AMOUNT");
        assertEq(contractAfter - contractBefore, AMOUNT, "contract should gain exactly AMOUNT");
    }

    function test_CreateBounty_IncrementsBountyCount() public {
        _createBounty();
        assertEq(mergePay.bountyCount(), 1);
        _createBounty();
        assertEq(mergePay.bountyCount(), 2);
    }

    // -----------------------------------------------------------------------
    // 3. createBounty — revert paths
    // -----------------------------------------------------------------------

    function test_CreateBounty_RevertZeroRecipient() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.ZeroAddress.selector);
        mergePay.createBounty(
            address(0), AMOUNT,
            uint64(block.timestamp) + uint64(FUTURE),
            REPO_HASH, ISSUE_NUM
        );
    }

    function test_CreateBounty_RevertSelfRecipient() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.SelfRecipient.selector);
        mergePay.createBounty(
            funder, AMOUNT,
            uint64(block.timestamp) + uint64(FUTURE),
            REPO_HASH, ISSUE_NUM
        );
    }

    function test_CreateBounty_RevertZeroAmount() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.ZeroAmount.selector);
        mergePay.createBounty(
            recipient, 0,
            uint64(block.timestamp) + uint64(FUTURE),
            REPO_HASH, ISSUE_NUM
        );
    }

    function test_CreateBounty_RevertExpiryInPast() public {
        // expiresAt == block.timestamp should also revert (requires strictly >)
        vm.prank(funder);
        vm.expectRevert(MergePay.InvalidExpiry.selector);
        mergePay.createBounty(
            recipient, AMOUNT,
            uint64(block.timestamp),   // equal → not strictly in the future
            REPO_HASH, ISSUE_NUM
        );
    }

    function test_CreateBounty_RevertExpiryStrictlyInPast() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.InvalidExpiry.selector);
        mergePay.createBounty(
            recipient, AMOUNT,
            uint64(block.timestamp) - 1,
            REPO_HASH, ISSUE_NUM
        );
    }

    function test_CreateBounty_RevertZeroRepositoryHash() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.InvalidRepositoryHash.selector);
        mergePay.createBounty(
            recipient, AMOUNT,
            uint64(block.timestamp) + uint64(FUTURE),
            bytes32(0), ISSUE_NUM
        );
    }

    function test_CreateBounty_RevertZeroIssueNumber() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.InvalidIssueNumber.selector);
        mergePay.createBounty(
            recipient, AMOUNT,
            uint64(block.timestamp) + uint64(FUTURE),
            REPO_HASH, 0
        );
    }

    function test_CreateBounty_RevertTokenTransferFails() public {
        // FailingERC20.transferFrom always reverts → SafeERC20 bubbles that up
        badToken.mint(funder, AMOUNT);
        vm.prank(funder);
        badToken.approve(address(mergePayBad), type(uint256).max);

        vm.prank(funder);
        vm.expectRevert(); // SafeERC20 wraps the inner revert — any revert is correct here
        mergePayBad.createBounty(
            recipient, AMOUNT,
            uint64(block.timestamp) + uint64(FUTURE),
            REPO_HASH, ISSUE_NUM
        );
    }

    // -----------------------------------------------------------------------
    // 4. release — happy path
    // -----------------------------------------------------------------------

    function test_Release_SendsExactAmountToRecipient() public {
        _createBounty();

        uint256 recipientBefore = usdc.balanceOf(recipient);
        uint256 contractBefore  = usdc.balanceOf(address(mergePay));

        vm.prank(funder);
        mergePay.release(1, PR_HASH);

        uint256 recipientAfter = usdc.balanceOf(recipient);
        uint256 contractAfter  = usdc.balanceOf(address(mergePay));

        assertEq(recipientAfter - recipientBefore, AMOUNT, "recipient should receive exactly AMOUNT");
        assertEq(contractBefore - contractAfter,   AMOUNT, "contract should lose exactly AMOUNT");
    }

    function test_Release_EmitsBountyReleased() public {
        _createBounty();

        vm.expectEmit(true, true, false, true, address(mergePay));
        emit MergePay.BountyReleased(1, recipient, AMOUNT, PR_HASH);

        vm.prank(funder);
        mergePay.release(1, PR_HASH);
    }

    function test_Release_StateBecomesReleased() public {
        _createBounty();

        vm.prank(funder);
        mergePay.release(1, PR_HASH);

        (,,,,,,MergePay.BountyState state) = mergePay.bounties(1);
        assertEq(uint8(state), uint8(MergePay.BountyState.Released), "state should be Released");
    }

    // -----------------------------------------------------------------------
    // 5. release — revert paths
    // -----------------------------------------------------------------------

    function test_Release_RevertBountyNotFound_Zero() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.BountyNotFound.selector);
        mergePay.release(0, PR_HASH);
    }

    function test_Release_RevertBountyNotFound_TooHigh() public {
        // No bounty created yet → bountyCount == 0, id 1 does not exist
        vm.prank(funder);
        vm.expectRevert(MergePay.BountyNotFound.selector);
        mergePay.release(1, PR_HASH);
    }

    function test_Release_RevertNotFunder() public {
        _createBounty();

        vm.prank(stranger);
        vm.expectRevert(MergePay.NotFunder.selector);
        mergePay.release(1, PR_HASH);
    }

    function test_Release_RevertWrongState_DuplicateRelease() public {
        _createBounty();

        vm.prank(funder);
        mergePay.release(1, PR_HASH);

        // Second release should hit WrongState (already Released)
        vm.prank(funder);
        vm.expectRevert(MergePay.WrongState.selector);
        mergePay.release(1, PR_HASH);
    }

    function test_Release_RevertAlreadyExpiredOrExpiring() public {
        _createBounty();

        // Warp past expiry
        vm.warp(block.timestamp + FUTURE + 1);

        vm.prank(funder);
        vm.expectRevert(MergePay.AlreadyExpiredOrExpiring.selector);
        mergePay.release(1, PR_HASH);
    }

    function test_Release_RevertAlreadyExpiredOrExpiring_AtBoundary() public {
        // expiresAt is block.timestamp + FUTURE
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        // Warp exactly to expiresAt → block.timestamp >= expiresAt should revert
        vm.warp(expiresAt);

        vm.prank(funder);
        vm.expectRevert(MergePay.AlreadyExpiredOrExpiring.selector);
        mergePay.release(1, PR_HASH);
    }

    // -----------------------------------------------------------------------
    // 6. refund — happy path
    // -----------------------------------------------------------------------

    function test_Refund_SendsExactAmountToFunder() public {
        _createBounty();

        // Warp past expiry
        vm.warp(block.timestamp + FUTURE + 1);

        uint256 funderBefore   = usdc.balanceOf(funder);
        uint256 contractBefore = usdc.balanceOf(address(mergePay));

        vm.prank(funder);
        mergePay.refund(1);

        uint256 funderAfter   = usdc.balanceOf(funder);
        uint256 contractAfter = usdc.balanceOf(address(mergePay));

        assertEq(funderAfter - funderBefore,     AMOUNT, "funder should receive exactly AMOUNT back");
        assertEq(contractBefore - contractAfter, AMOUNT, "contract should lose exactly AMOUNT");
    }

    function test_Refund_EmitsBountyRefunded() public {
        _createBounty();
        vm.warp(block.timestamp + FUTURE + 1);

        vm.expectEmit(true, true, false, true, address(mergePay));
        emit MergePay.BountyRefunded(1, funder, AMOUNT);

        vm.prank(funder);
        mergePay.refund(1);
    }

    function test_Refund_StateBecomesRefunded() public {
        _createBounty();
        vm.warp(block.timestamp + FUTURE + 1);

        vm.prank(funder);
        mergePay.refund(1);

        (,,,,,,MergePay.BountyState state) = mergePay.bounties(1);
        assertEq(uint8(state), uint8(MergePay.BountyState.Refunded), "state should be Refunded");
    }

    /// @dev Boundary: block.timestamp == expiresAt → refund should SUCCEED
    function test_Refund_SucceedsAtExactExpiryBoundary() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        // Warp to exactly expiresAt → contract uses `< expiresAt` for NotExpired check
        vm.warp(expiresAt);

        vm.prank(funder);
        mergePay.refund(1);   // should not revert

        (,,,,,,MergePay.BountyState state) = mergePay.bounties(1);
        assertEq(uint8(state), uint8(MergePay.BountyState.Refunded));
    }

    // -----------------------------------------------------------------------
    // 7. refund — revert paths
    // -----------------------------------------------------------------------

    function test_Refund_RevertBountyNotFound_Zero() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.BountyNotFound.selector);
        mergePay.refund(0);
    }

    function test_Refund_RevertBountyNotFound_TooHigh() public {
        vm.prank(funder);
        vm.expectRevert(MergePay.BountyNotFound.selector);
        mergePay.refund(1);
    }

    function test_Refund_RevertNotFunder() public {
        _createBounty();
        vm.warp(block.timestamp + FUTURE + 1);

        vm.prank(stranger);
        vm.expectRevert(MergePay.NotFunder.selector);
        mergePay.refund(1);
    }

    function test_Refund_RevertNotExpired_BeforeExpiry() public {
        _createBounty();

        // Still before expiry → NotExpired
        vm.prank(funder);
        vm.expectRevert(MergePay.NotExpired.selector);
        mergePay.refund(1);
    }

    function test_Refund_RevertNotExpired_OneSecondBefore() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        vm.warp(expiresAt - 1);  // one second before expiry

        vm.prank(funder);
        vm.expectRevert(MergePay.NotExpired.selector);
        mergePay.refund(1);
    }

    function test_Refund_RevertWrongState_DuplicateRefund() public {
        _createBounty();
        vm.warp(block.timestamp + FUTURE + 1);

        vm.prank(funder);
        mergePay.refund(1);

        // Second refund on same bounty → WrongState (already Refunded)
        vm.prank(funder);
        vm.expectRevert(MergePay.WrongState.selector);
        mergePay.refund(1);
    }

    function test_Refund_RevertWrongState_AfterRelease() public {
        _createBounty();

        vm.prank(funder);
        mergePay.release(1, PR_HASH);

        // Warp past expiry so NotExpired check would pass
        vm.warp(block.timestamp + FUTURE + 1);

        vm.prank(funder);
        vm.expectRevert(MergePay.WrongState.selector);
        mergePay.refund(1);
    }

    // -----------------------------------------------------------------------
    // 8. Cross-function: release on Refunded bounty
    // -----------------------------------------------------------------------

    function test_Release_RevertWrongState_AfterRefund() public {
        _createBounty();
        vm.warp(block.timestamp + FUTURE + 1);

        vm.prank(funder);
        mergePay.refund(1);

        // Now try to release — should hit WrongState
        vm.prank(funder);
        vm.expectRevert(MergePay.WrongState.selector);
        mergePay.release(1, PR_HASH);
    }

    // -----------------------------------------------------------------------
    // 9. Fuzz — createBounty with varied valid inputs
    // -----------------------------------------------------------------------

    function testFuzz_CreateBounty_ValidInputs(
        uint256 amount,
        uint64  expiresAtOffset,   // offset > 1 added to block.timestamp
        bytes32 repositoryHash,
        uint256 issueNumber
    ) public {
        // Bound inputs to valid ranges
        amount         = bound(amount,         1,       type(uint128).max); // non-zero, not enormous
        expiresAtOffset = uint64(bound(expiresAtOffset, 2, 365 days));       // strictly in the future
        vm.assume(repositoryHash != bytes32(0));
        issueNumber    = bound(issueNumber,    1,       type(uint128).max);

        uint64 expiresAt = uint64(block.timestamp) + expiresAtOffset;

        // Seed funder balance
        usdc.mint(funder, amount);
        // Approval already set to max in setUp

        vm.prank(funder);
        uint256 bountyId = mergePay.createBounty(
            recipient, amount, expiresAt, repositoryHash, issueNumber
        );

        (
            address storedFunder,
            address storedRecipient,
            uint256 storedAmount,
            uint64  storedExpiry,
            bytes32 storedRepoHash,
            uint256 storedIssueNum,
            MergePay.BountyState storedState
        ) = mergePay.bounties(bountyId);

        assertEq(storedFunder,    funder,         "fuzz: funder");
        assertEq(storedRecipient, recipient,      "fuzz: recipient");
        assertEq(storedAmount,    amount,         "fuzz: amount");
        assertEq(storedExpiry,    expiresAt,      "fuzz: expiresAt");
        assertEq(storedRepoHash,  repositoryHash, "fuzz: repositoryHash");
        assertEq(storedIssueNum,  issueNumber,    "fuzz: issueNumber");
        assertEq(uint8(storedState), uint8(MergePay.BountyState.Funded), "fuzz: state");
    }

    // -----------------------------------------------------------------------
    // 10. Fuzz — release stays within valid window
    // -----------------------------------------------------------------------

    function testFuzz_Release_SucceedsBeforeExpiry(uint64 warpOffset) public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        // Warp to somewhere strictly before expiresAt
        warpOffset = uint64(bound(warpOffset, 0, FUTURE - 1));
        vm.warp(block.timestamp + warpOffset);

        vm.prank(funder);
        mergePay.release(1, PR_HASH);

        (,,,,,,MergePay.BountyState state) = mergePay.bounties(1);
        assertEq(uint8(state), uint8(MergePay.BountyState.Released));
    }

    // -----------------------------------------------------------------------
    // 11. Fuzz — refund only succeeds at or after expiry
    // -----------------------------------------------------------------------

    function testFuzz_Refund_SucceedsAtOrAfterExpiry(uint64 warpOffset) public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        // Warp to expiresAt or later
        warpOffset = uint64(bound(warpOffset, 0, 365 days));
        vm.warp(expiresAt + warpOffset);

        vm.prank(funder);
        mergePay.refund(1);

        (,,,,,,MergePay.BountyState state) = mergePay.bounties(1);
        assertEq(uint8(state), uint8(MergePay.BountyState.Refunded));
    }

    // -----------------------------------------------------------------------
    // 12. Receipt-level Transfer event invariants
    //
    // These tests verify the guarantees that the off-chain verifyUsdcTransfer
    // function depends on:
    //   - release emits Transfer(from=MergePay, to=recipient, value=amount)
    //   - refund  emits Transfer(from=MergePay, to=funder,    value=amount)
    //   - Final contract state is Released / Refunded respectively
    //
    // They also confirm that wrong-sender / wrong-recipient / wrong-amount
    // scenarios cannot occur from the contract's own Transfer emissions.
    // -----------------------------------------------------------------------

    /// @dev The ERC-20 Transfer event topic for expectEmit matching
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// release: emits ERC-20 Transfer(from=contract, to=recipient, value=AMOUNT)
    function test_Release_EmitsCorrectERC20Transfer() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        // Expect the ERC-20 Transfer from the MergePay contract to the recipient
        vm.expectEmit(true, true, false, true, address(usdc));
        emit Transfer(address(mergePay), recipient, AMOUNT);

        vm.prank(funder);
        mergePay.release(1, PR_HASH);
    }

    /// release: final state is Released (not Funded, not Refunded)
    function test_Release_FinalStateIsReleased() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        vm.prank(funder);
        mergePay.release(1, PR_HASH);

        (,,,,,,MergePay.BountyState state) = mergePay.bounties(1);
        assertEq(uint8(state), uint8(MergePay.BountyState.Released),
            "state must be Released after release()");
        assertTrue(uint8(state) != uint8(MergePay.BountyState.Funded),   "must not remain Funded");
        assertTrue(uint8(state) != uint8(MergePay.BountyState.Refunded), "must not be Refunded");
    }

    /// release: exact bounty amount reaches recipient (balance diff == AMOUNT)
    function test_Release_RecipientReceivesExactAmount() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        uint256 before = usdc.balanceOf(recipient);
        vm.prank(funder);
        mergePay.release(1, PR_HASH);
        uint256 after_ = usdc.balanceOf(recipient);

        assertEq(after_ - before, AMOUNT, "recipient must receive exactly bounty amount");
    }

    /// release: contract balance decreases by exactly AMOUNT
    function test_Release_ContractBalanceDecreasesExactly() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        uint256 contractBefore = usdc.balanceOf(address(mergePay));
        vm.prank(funder);
        mergePay.release(1, PR_HASH);
        uint256 contractAfter = usdc.balanceOf(address(mergePay));

        assertEq(contractBefore - contractAfter, AMOUNT, "contract balance must decrease by exactly AMOUNT");
    }

    /// release: Transfer is from the contract, not from the funder directly
    function test_Release_TransferSenderIsContract_NotFunder() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        uint256 funderBefore = usdc.balanceOf(funder);
        vm.prank(funder);
        mergePay.release(1, PR_HASH);
        uint256 funderAfter = usdc.balanceOf(funder);

        // Funder's balance should be unchanged after release (they already paid at createBounty)
        assertEq(funderBefore, funderAfter, "funder balance must not change during release");
    }

    /// refund: emits ERC-20 Transfer(from=contract, to=funder, value=AMOUNT)
    function test_Refund_EmitsCorrectERC20Transfer() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);
        vm.warp(expiresAt);

        vm.expectEmit(true, true, false, true, address(usdc));
        emit Transfer(address(mergePay), funder, AMOUNT);

        vm.prank(funder);
        mergePay.refund(1);
    }

    /// refund: final state is Refunded (not Funded, not Released)
    function test_Refund_FinalStateIsRefunded() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);
        vm.warp(expiresAt);

        vm.prank(funder);
        mergePay.refund(1);

        (,,,,,,MergePay.BountyState state) = mergePay.bounties(1);
        assertEq(uint8(state), uint8(MergePay.BountyState.Refunded),
            "state must be Refunded after refund()");
        assertTrue(uint8(state) != uint8(MergePay.BountyState.Funded),   "must not remain Funded");
        assertTrue(uint8(state) != uint8(MergePay.BountyState.Released), "must not be Released");
    }

    /// refund: exact bounty amount returns to funder (balance diff == AMOUNT)
    function test_Refund_FunderReceivesExactAmount() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);
        vm.warp(expiresAt);

        // funder paid AMOUNT at create; capture balance after createBounty
        uint256 funderAfterCreate = usdc.balanceOf(funder);

        vm.prank(funder);
        mergePay.refund(1);
        uint256 funderAfterRefund = usdc.balanceOf(funder);

        assertEq(funderAfterRefund - funderAfterCreate, AMOUNT,
            "funder must receive exactly bounty amount on refund");
    }

    /// refund: Transfer goes to funder, not to recipient
    function test_Refund_TransferGoesToFunder_NotRecipient() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);
        vm.warp(expiresAt);

        uint256 recipientBefore = usdc.balanceOf(recipient);
        vm.prank(funder);
        mergePay.refund(1);
        uint256 recipientAfter = usdc.balanceOf(recipient);

        assertEq(recipientBefore, recipientAfter,
            "recipient balance must not change during refund");
    }

    /// release: no Transfer event goes to funder (funds go to recipient only)
    function test_Release_NoTransferToFunder() public {
        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, AMOUNT, expiresAt, REPO_HASH, ISSUE_NUM);

        uint256 funderBefore = usdc.balanceOf(funder);
        vm.prank(funder);
        mergePay.release(1, PR_HASH);
        uint256 funderAfter = usdc.balanceOf(funder);

        assertEq(funderBefore, funderAfter,
            "funder must receive nothing from release: funds go to recipient");
    }

    /// release: partial amount cannot satisfy the bounty (different amount bounty)
    function test_Release_DifferentAmountBounty_StillExact() public {
        uint256 differentAmount = 77_777e6; // not AMOUNT
        usdc.mint(funder, differentAmount);

        uint64 expiresAt = uint64(block.timestamp) + uint64(FUTURE);
        vm.prank(funder);
        mergePay.createBounty(recipient, differentAmount, expiresAt, REPO_HASH, ISSUE_NUM);

        uint256 recipientBefore = usdc.balanceOf(recipient);
        vm.prank(funder);
        mergePay.release(1, PR_HASH); // first and only bounty in this test

        assertEq(usdc.balanceOf(recipient) - recipientBefore, differentAmount,
            "release must transfer the stored amount, not a hardcoded value");
    }
}
