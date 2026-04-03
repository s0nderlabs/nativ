// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TaskEscrow — Native token escrow for agent tasks on nativ
/// @notice Ported from Souq's AgenticJobEscrow, adapted for native NATIV payments
contract TaskEscrow is Ownable, ReentrancyGuard {

    // ──────────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────────

    enum TaskStatus {
        Open,
        Funded,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    struct Task {
        address client;
        address provider;
        address evaluator;
        uint256 budget;
        uint256 expiredAt;
        bytes32 description;
        bytes32 deliverable;
        TaskStatus status;
    }

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    error InvalidEvaluator();
    error InvalidExpiry();
    error TaskNotFound();
    error InvalidStatus();
    error NotClient();
    error NotProvider();
    error NotClientOrProvider();
    error NotEvaluator();
    error ProviderNotSet();
    error ProviderAlreadySet();
    error BudgetMismatch(uint256 expected, uint256 actual);
    error NotExpired();
    error TaskExpired();
    error ZeroBudget();
    error ZeroAddress();
    error FeeTooHigh();
    error TransferFailed();

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event TaskCreated(uint256 indexed taskId, address indexed client, address provider, address evaluator, uint256 expiredAt);
    event ProviderSet(uint256 indexed taskId, address indexed provider);
    event BudgetSet(uint256 indexed taskId, uint256 amount);
    event TaskFunded(uint256 indexed taskId, uint256 amount);
    event WorkSubmitted(uint256 indexed taskId, bytes32 deliverable);
    event TaskCompleted(uint256 indexed taskId, uint256 providerPayout, uint256 evaluatorPayout, uint256 platformFee);
    event TaskRejected(uint256 indexed taskId, address indexed rejectedBy, bytes32 reason);
    event RefundClaimed(uint256 indexed taskId, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PlatformFeeUpdated(uint256 oldFeeBP, uint256 newFeeBP);
    event EvaluatorFeeUpdated(uint256 oldFeeBP, uint256 newFeeBP);

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    uint256 private constant BPS_DENOMINATOR = 10_000;

    address public treasury;
    uint256 public platformFeeBP;
    uint256 public evaluatorFeeBP;
    uint256 public taskCount;
    mapping(uint256 => Task) internal _tasks;

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor(
        address treasury_,
        uint256 platformFeeBP_,
        uint256 evaluatorFeeBP_,
        address owner_
    ) Ownable(owner_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (platformFeeBP_ + evaluatorFeeBP_ > BPS_DENOMINATOR) revert FeeTooHigh();
        treasury = treasury_;
        platformFeeBP = platformFeeBP_;
        evaluatorFeeBP = evaluatorFeeBP_;
    }

    // ──────────────────────────────────────────────
    // Core Lifecycle
    // ──────────────────────────────────────────────

    function createTask(
        address provider_,
        address evaluator_,
        uint256 expiredAt_,
        bytes32 description_
    ) external nonReentrant returns (uint256 taskId) {
        if (evaluator_ == address(0)) revert InvalidEvaluator();
        if (evaluator_ == msg.sender) revert InvalidEvaluator();
        if (expiredAt_ <= block.timestamp) revert InvalidExpiry();

        taskId = ++taskCount;
        _tasks[taskId] = Task({
            client: msg.sender,
            provider: provider_,
            evaluator: evaluator_,
            budget: 0,
            expiredAt: expiredAt_,
            description: description_,
            deliverable: bytes32(0),
            status: TaskStatus.Open
        });

        emit TaskCreated(taskId, msg.sender, provider_, evaluator_, expiredAt_);
    }

    function setProvider(uint256 taskId, address provider_) external nonReentrant {
        Task storage task = _getTask(taskId);
        if (task.status != TaskStatus.Open) revert InvalidStatus();
        if (msg.sender != task.client) revert NotClient();
        if (provider_ == address(0)) revert ZeroAddress();
        if (task.provider != address(0)) revert ProviderAlreadySet();

        task.provider = provider_;
        emit ProviderSet(taskId, provider_);
    }

    function setBudget(uint256 taskId, uint256 amount_) external nonReentrant {
        Task storage task = _getTask(taskId);
        if (task.status != TaskStatus.Open) revert InvalidStatus();
        if (msg.sender != task.client && msg.sender != task.provider) revert NotClientOrProvider();
        if (amount_ == 0) revert ZeroBudget();

        task.budget = amount_;
        emit BudgetSet(taskId, amount_);
    }

    function fund(uint256 taskId, uint256 expectedBudget_) external payable nonReentrant {
        Task storage task = _getTask(taskId);
        if (task.status != TaskStatus.Open) revert InvalidStatus();
        if (msg.sender != task.client) revert NotClient();
        if (task.provider == address(0)) revert ProviderNotSet();
        if (task.budget == 0) revert ZeroBudget();
        if (expectedBudget_ != task.budget) revert BudgetMismatch(expectedBudget_, task.budget);
        if (msg.value != task.budget) revert BudgetMismatch(task.budget, msg.value);

        task.status = TaskStatus.Funded;
        emit TaskFunded(taskId, task.budget);
    }

    function submit(uint256 taskId, bytes32 deliverable_) external nonReentrant {
        Task storage task = _getTask(taskId);
        if (task.status != TaskStatus.Funded) revert InvalidStatus();
        if (msg.sender != task.provider) revert NotProvider();

        task.deliverable = deliverable_;
        task.status = TaskStatus.Submitted;
        emit WorkSubmitted(taskId, deliverable_);
    }

    function complete(uint256 taskId, bytes32 /* reason_ */) external nonReentrant {
        Task storage task = _getTask(taskId);
        if (task.status != TaskStatus.Submitted) revert InvalidStatus();
        if (msg.sender != task.evaluator) revert NotEvaluator();
        if (block.timestamp >= task.expiredAt) revert TaskExpired();

        task.status = TaskStatus.Completed;

        uint256 budget = task.budget;
        uint256 pFee = (budget * platformFeeBP) / BPS_DENOMINATOR;
        uint256 eFee = (budget * evaluatorFeeBP) / BPS_DENOMINATOR;
        uint256 providerPayout = budget - pFee - eFee;

        if (pFee > 0) _transfer(treasury, pFee);
        if (eFee > 0) _transfer(task.evaluator, eFee);
        _transfer(task.provider, providerPayout);

        emit TaskCompleted(taskId, providerPayout, eFee, pFee);
    }

    function reject(uint256 taskId, bytes32 reason_) external nonReentrant {
        Task storage task = _getTask(taskId);

        if (task.status == TaskStatus.Open) {
            if (msg.sender != task.client) revert NotClient();
        } else if (task.status == TaskStatus.Funded || task.status == TaskStatus.Submitted) {
            if (msg.sender != task.evaluator) revert NotEvaluator();
            if (block.timestamp >= task.expiredAt) revert TaskExpired();
        } else {
            revert InvalidStatus();
        }

        TaskStatus previousStatus = task.status;
        task.status = TaskStatus.Rejected;

        if (previousStatus == TaskStatus.Funded || previousStatus == TaskStatus.Submitted) {
            _transfer(task.client, task.budget);
        }

        emit TaskRejected(taskId, msg.sender, reason_);
    }

    /// @notice Safety valve — anyone can trigger refund after expiry. Not hookable by design.
    function claimRefund(uint256 taskId) external nonReentrant {
        Task storage task = _getTask(taskId);
        if (task.status != TaskStatus.Funded && task.status != TaskStatus.Submitted) {
            revert InvalidStatus();
        }
        if (block.timestamp < task.expiredAt) revert NotExpired();

        task.status = TaskStatus.Expired;
        _transfer(task.client, task.budget);
        emit RefundClaimed(taskId, task.budget);
    }

    // ──────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = treasury_;
        emit TreasuryUpdated(old, treasury_);
    }

    function setPlatformFee(uint256 feeBP_) external onlyOwner {
        if (feeBP_ + evaluatorFeeBP > BPS_DENOMINATOR) revert FeeTooHigh();
        uint256 old = platformFeeBP;
        platformFeeBP = feeBP_;
        emit PlatformFeeUpdated(old, feeBP_);
    }

    function setEvaluatorFee(uint256 feeBP_) external onlyOwner {
        if (platformFeeBP + feeBP_ > BPS_DENOMINATOR) revert FeeTooHigh();
        uint256 old = evaluatorFeeBP;
        evaluatorFeeBP = feeBP_;
        emit EvaluatorFeeUpdated(old, feeBP_);
    }

    // ──────────────────────────────────────────────
    // View
    // ──────────────────────────────────────────────

    function getTask(uint256 taskId) external view returns (Task memory) {
        return _tasks[taskId];
    }

    // ──────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────

    function _getTask(uint256 taskId) internal view returns (Task storage) {
        if (taskId == 0 || taskId > taskCount) revert TaskNotFound();
        return _tasks[taskId];
    }

    function _transfer(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
