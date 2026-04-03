// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";

contract TaskEscrowTest is Test {
    TaskEscrow escrow;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address client = makeAddr("client");
    address provider = makeAddr("provider");
    address evaluator = makeAddr("evaluator");

    uint256 constant PLATFORM_FEE_BP = 500;  // 5%
    uint256 constant EVALUATOR_FEE_BP = 500; // 5%

    function setUp() public {
        escrow = new TaskEscrow(treasury, PLATFORM_FEE_BP, EVALUATOR_FEE_BP, owner);
        vm.deal(client, 100 ether);
        vm.deal(provider, 10 ether);
    }

    // ──────────────── Happy Path ────────────────

    function test_fullLifecycle() public {
        // Create
        vm.prank(client);
        uint256 taskId = escrow.createTask(provider, evaluator, block.timestamp + 1 days, keccak256("build a dex"));
        assertEq(taskId, 1);

        // Set budget
        vm.prank(client);
        escrow.setBudget(taskId, 10 ether);

        // Fund
        vm.prank(client);
        escrow.fund{value: 10 ether}(taskId, 10 ether);

        TaskEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(uint8(task.status), uint8(TaskEscrow.TaskStatus.Funded));

        // Submit
        vm.prank(provider);
        escrow.submit(taskId, keccak256("deliverable-hash"));

        task = escrow.getTask(taskId);
        assertEq(uint8(task.status), uint8(TaskEscrow.TaskStatus.Submitted));

        // Complete
        uint256 providerBefore = provider.balance;
        uint256 evaluatorBefore = evaluator.balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(evaluator);
        escrow.complete(taskId, keccak256("approved"));

        task = escrow.getTask(taskId);
        assertEq(uint8(task.status), uint8(TaskEscrow.TaskStatus.Completed));

        // Verify payouts: 5% platform, 5% evaluator, 90% provider
        assertEq(treasury.balance - treasuryBefore, 0.5 ether);
        assertEq(evaluator.balance - evaluatorBefore, 0.5 ether);
        assertEq(provider.balance - providerBefore, 9 ether);
    }

    // ──────────────── Create ────────────────

    function test_createTask_noProvider() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(address(0), evaluator, block.timestamp + 1 days, keccak256("task"));
        TaskEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(task.provider, address(0));
    }

    function test_createTask_revert_invalidEvaluator() public {
        vm.expectRevert(TaskEscrow.InvalidEvaluator.selector);
        vm.prank(client);
        escrow.createTask(provider, address(0), block.timestamp + 1 days, keccak256("task"));
    }

    function test_createTask_revert_evaluatorIsClient() public {
        vm.expectRevert(TaskEscrow.InvalidEvaluator.selector);
        vm.prank(client);
        escrow.createTask(provider, client, block.timestamp + 1 days, keccak256("task"));
    }

    function test_createTask_revert_invalidExpiry() public {
        vm.expectRevert(TaskEscrow.InvalidExpiry.selector);
        vm.prank(client);
        escrow.createTask(provider, evaluator, block.timestamp, keccak256("task"));
    }

    // ──────────────── Set Provider ────────────────

    function test_setProvider() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(address(0), evaluator, block.timestamp + 1 days, keccak256("task"));

        vm.prank(client);
        escrow.setProvider(taskId, provider);

        TaskEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(task.provider, provider);
    }

    function test_setProvider_revert_alreadySet() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(provider, evaluator, block.timestamp + 1 days, keccak256("task"));

        vm.expectRevert(TaskEscrow.ProviderAlreadySet.selector);
        vm.prank(client);
        escrow.setProvider(taskId, makeAddr("other"));
    }

    // ──────────────── Fund ────────────────

    function test_fund_revert_noProvider() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(address(0), evaluator, block.timestamp + 1 days, keccak256("task"));

        vm.prank(client);
        escrow.setBudget(taskId, 1 ether);

        vm.expectRevert(TaskEscrow.ProviderNotSet.selector);
        vm.prank(client);
        escrow.fund{value: 1 ether}(taskId, 1 ether);
    }

    function test_fund_revert_budgetMismatch() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(provider, evaluator, block.timestamp + 1 days, keccak256("task"));

        vm.prank(client);
        escrow.setBudget(taskId, 1 ether);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.BudgetMismatch.selector, 1 ether, 2 ether));
        vm.prank(client);
        escrow.fund{value: 2 ether}(taskId, 1 ether);
    }

    // ──────────────── Reject ────────────────

    function test_reject_openByClient() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(provider, evaluator, block.timestamp + 1 days, keccak256("task"));

        vm.prank(client);
        escrow.reject(taskId, keccak256("changed mind"));

        TaskEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(uint8(task.status), uint8(TaskEscrow.TaskStatus.Rejected));
    }

    function test_reject_fundedByEvaluator() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(provider, evaluator, block.timestamp + 1 days, keccak256("task"));
        vm.prank(client);
        escrow.setBudget(taskId, 5 ether);
        vm.prank(client);
        escrow.fund{value: 5 ether}(taskId, 5 ether);

        uint256 clientBefore = client.balance;

        vm.prank(evaluator);
        escrow.reject(taskId, keccak256("bad work"));

        assertEq(client.balance - clientBefore, 5 ether);
    }

    // ──────────────── Claim Refund ────────────────

    function test_claimRefund() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(provider, evaluator, block.timestamp + 1 days, keccak256("task"));
        vm.prank(client);
        escrow.setBudget(taskId, 5 ether);
        vm.prank(client);
        escrow.fund{value: 5 ether}(taskId, 5 ether);

        // Fast forward past expiry
        vm.warp(block.timestamp + 2 days);

        uint256 clientBefore = client.balance;
        escrow.claimRefund(taskId);

        assertEq(client.balance - clientBefore, 5 ether);
        TaskEscrow.Task memory task = escrow.getTask(taskId);
        assertEq(uint8(task.status), uint8(TaskEscrow.TaskStatus.Expired));
    }

    function test_claimRefund_revert_notExpired() public {
        vm.prank(client);
        uint256 taskId = escrow.createTask(provider, evaluator, block.timestamp + 1 days, keccak256("task"));
        vm.prank(client);
        escrow.setBudget(taskId, 5 ether);
        vm.prank(client);
        escrow.fund{value: 5 ether}(taskId, 5 ether);

        vm.expectRevert(TaskEscrow.NotExpired.selector);
        escrow.claimRefund(taskId);
    }

    // ──────────────── Admin ────────────────

    function test_setTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(owner);
        escrow.setTreasury(newTreasury);
        assertEq(escrow.treasury(), newTreasury);
    }

    function test_setTreasury_revert_notOwner() public {
        vm.expectRevert();
        vm.prank(client);
        escrow.setTreasury(makeAddr("newTreasury"));
    }
}
