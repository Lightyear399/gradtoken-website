// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title GradStaking (GradStake, Phase 1 MVP)
/// @notice Stake GRAD, earn GRAD, on a fixed emission rate set by the owner
///         per funding round. Uses the standard "Synthetix-style" reward-per-
///         token-stored accounting model — the same pattern used by the
///         large majority of audited staking contracts in production, rather
///         than a novel design.
/// @dev Security notes:
///  - `nonReentrant` on every state-changing external function that moves
///    tokens (stake, withdraw, getReward, exit).
///  - Checks-effects-interactions everywhere: internal balances/reward debt
///    are updated before any external token transfer.
///  - `updateReward` modifier runs on every stake/withdraw/getReward call so
///    reward accounting is always settled against current balances before
///    they change — this is what prevents the classic "stake right before
///    reward calculation" reward-sniping bug.
///  - SafeERC20 used throughout instead of raw transfer/transferFrom.
///  - Pausable: owner can pause new stakes/reward claims in an emergency
///    (e.g. a bug is found post-deploy) WITHOUT ever being able to touch
///    user principal — `withdraw` and `emergencyWithdraw` both stay callable
///    even while paused, so the contract can never trap user funds.
///  - Owner cannot mint, seize, or blacklist — the only privileged actions
///    are: set the reward rate/duration for a new funding round, tune the
///    anti-sniping minimum stake amount/duration, pause/unpause new stakes
///    and reward claims, and recover accidentally-sent non-staking-token
///    ERC-20s (explicitly blocked from ever touching the GRAD staking/reward
///    token itself, see `recoverERC20`).
///  - Reward funding is pull-based: `notifyRewardAmount` requires the reward
///    tokens to already be in the contract (transferred in by the owner
///    beforehand), so the contract can never promise rewards it doesn't hold.
///  - Anti-sniping: `minStakeAmount` + `minStakeDuration` together close a
///    real finding from penetration testing — without them, whoever is the
///    sole staker at a given instant captures the FULL reward emission for
///    that instant regardless of stake size, since rewards split by *share
///    of pool* not absolute amount. A bot could otherwise stake 1 wei the
///    moment the pool is empty and harvest real reward budget for
///    essentially zero capital at risk. See test/Security.exploit.test.js.
contract GradStaking is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice The GRAD token, used for both staking and rewards.
    IERC20 public immutable gradToken;

    uint256 public rewardRate; // reward tokens emitted per second, scaled by 1e18 internally via rewardPerTokenStored
    uint256 public rewardsDuration = 30 days;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    /// @notice Minimum time a position must be continuously staked before
    ///         its rewards become claimable. Mitigates "empty pool sniping":
    ///         without this, whoever is the sole staker at a given instant
    ///         captures the FULL reward emission for that instant regardless
    ///         of how small their stake is (reward is split by *share of
    ///         pool*, not absolute size) — a bot could otherwise stake a
    ///         trivial amount the moment the pool is empty, claim, and
    ///         withdraw, extracting real reward budget for near-zero capital
    ///         at risk. Requiring a hold period gives the attacker genuine
    ///         price/opportunity-cost exposure, which is the standard
    ///         economic deterrent real staking protocols use.
    uint256 public minStakeDuration = 1 hours;
    uint256 public constant MAX_MIN_STAKE_DURATION = 7 days;
    mapping(address => uint256) public lastStakeTimestamp;

    /// @notice Minimum amount for any single stake() call. Works alongside
    ///         `minStakeDuration` — a duration gate alone doesn't help if the
    ///         amount at risk during that wait is negligible (waiting costs
    ///         nothing if you have ~nothing locked up). Together, amount x
    ///         duration gives an attacker genuine capital exposure, which is
    ///         what actually makes "snipe an empty pool" economically
    ///         irrational rather than just technically inconvenient.
    uint256 public minStakeAmount = 1 * 10 ** 18; // 1 GRAD by default

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 private _totalStaked;
    mapping(address => uint256) private _balances;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward, uint256 duration);
    event EmergencyWithdrawn(address indexed user, uint256 amount);
    event Recovered(address indexed token, uint256 amount);

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(address gradTokenAddress, address initialOwner) Ownable(initialOwner) {
        require(gradTokenAddress != address(0), "GradStaking: zero token");
        gradToken = IERC20(gradTokenAddress);
    }

    // ---------- Views ----------

    function totalStaked() external view returns (uint256) {
        return _totalStaked;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalStaked == 0) {
            return rewardPerTokenStored;
        }
        uint256 elapsed = lastTimeRewardApplicable() - lastUpdateTime;
        return rewardPerTokenStored + (elapsed * rewardRate * 1e18) / _totalStaked;
    }

    function earned(address account) public view returns (uint256) {
        return (_balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18 + rewards[account];
    }

    // ---------- User actions ----------

    function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount >= minStakeAmount, "GradStaking: amount below minimum stake");

        // Effects before interaction.
        _totalStaked += amount;
        _balances[msg.sender] += amount;
        // Every top-up resets the holding clock for the WHOLE position, not
        // just the new increment. Simpler and cheaper than per-deposit
        // tranche tracking, and the standard tradeoff for an MVP: it means a
        // long-time staker who tops up delays their own next claim, which is
        // an accepted, well-precedented UX cost in exchange for closing the
        // sniping vector above.
        lastStakeTimestamp[msg.sender] = block.timestamp;

        emit Staked(msg.sender, amount);
        gradToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw staked principal. Deliberately NOT gated by
    ///         `whenNotPaused` — pausing can stop new stakes/claims but must
    ///         never be able to lock up a user's own principal indefinitely.
    ///         IS gated by `minStakeDuration`, same as `getReward()`: this is
    ///         the path that preserves reward eligibility, and gating it is
    ///         what actually closes the empty-pool-sniping vector (gating
    ///         `getReward()` alone isn't sufficient — an attacker could bank
    ///         reward via rapid stake/withdraw cycles and simply wait out the
    ///         cooldown before claiming, at zero ongoing cost, since their
    ///         capital would already be back in their wallet). A user who
    ///         wants their principal back before the duration elapses can
    ///         always use `emergencyWithdraw()` instead, forfeiting rewards —
    ///         funds are never permanently trapped, just this one path to
    ///         them is time-gated.
    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        require(amount > 0, "GradStaking: cannot withdraw 0");
        require(_balances[msg.sender] >= amount, "GradStaking: insufficient balance");
        require(
            block.timestamp >= lastStakeTimestamp[msg.sender] + minStakeDuration,
            "GradStaking: position must be held for the minimum stake duration; use emergencyWithdraw() to exit early and forfeit rewards"
        );

        // Effects before interaction.
        _totalStaked -= amount;
        _balances[msg.sender] -= amount;

        emit Withdrawn(msg.sender, amount);
        gradToken.safeTransfer(msg.sender, amount);
    }

    function getReward() public nonReentrant whenNotPaused updateReward(msg.sender) {
        require(
            block.timestamp >= lastStakeTimestamp[msg.sender] + minStakeDuration,
            "GradStaking: position must be held for the minimum stake duration before claiming"
        );
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            // Effects before interaction.
            rewards[msg.sender] = 0;
            emit RewardPaid(msg.sender, reward);
            gradToken.safeTransfer(msg.sender, reward);
        }
    }

    /// @notice Withdraw all staked principal and claim reward in one call.
    ///         Subject to the same `minStakeDuration` gate as `withdraw()`
    ///         and `getReward()` individually — use `emergencyWithdraw()`
    ///         instead for an instant, reward-forfeiting exit.
    function exit() external {
        withdraw(_balances[msg.sender]);
        getReward();
    }

    /// @notice Escape hatch: withdraw principal, forfeiting unclaimed
    ///         rewards, without touching reward accounting. Available even
    ///         when paused, so funds are never trapped by an emergency pause.
    function emergencyWithdraw() external nonReentrant {
        uint256 amount = _balances[msg.sender];
        require(amount > 0, "GradStaking: nothing staked");

        _totalStaked -= amount;
        _balances[msg.sender] = 0;
        rewards[msg.sender] = 0;

        emit EmergencyWithdrawn(msg.sender, amount);
        gradToken.safeTransfer(msg.sender, amount);
    }

    // ---------- Owner actions ----------

    /// @notice Fund a new reward period. Caller (owner) must have already
    ///         transferred `reward` GRAD into this contract beforehand — the
    ///         contract never assumes tokens it doesn't hold.
    function notifyRewardAmount(uint256 reward) external onlyOwner updateReward(address(0)) {
        require(reward > 0, "GradStaking: zero reward");

        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / rewardsDuration;
        }

        // Solvency check: the contract must hold enough GRAD to cover every
        // reward this period could possibly emit, on top of all staked
        // principal — this is what prevents `notifyRewardAmount` from ever
        // promising more than the contract can pay out.
        uint256 balance = gradToken.balanceOf(address(this));
        require(rewardRate * rewardsDuration <= balance - _totalStaked, "GradStaking: reward too high for balance");

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;

        emit RewardAdded(reward, rewardsDuration);
    }

    function setRewardsDuration(uint256 newDuration) external onlyOwner {
        require(block.timestamp > periodFinish, "GradStaking: previous period still active");
        require(newDuration > 0, "GradStaking: zero duration");
        rewardsDuration = newDuration;
    }

    /// @notice Tune the anti-sniping minimum hold time. Bounded so the owner
    ///         can't accidentally (or maliciously) set an absurd multi-year
    ///         lockup — anyone unhappy with a change can still exit instantly
    ///         via `emergencyWithdraw()`, forfeiting rewards.
    function setMinStakeDuration(uint256 newDuration) external onlyOwner {
        require(newDuration <= MAX_MIN_STAKE_DURATION, "GradStaking: duration too long");
        minStakeDuration = newDuration;
    }

    function setMinStakeAmount(uint256 newMinAmount) external onlyOwner {
        minStakeAmount = newMinAmount;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover ERC-20 tokens accidentally sent to this contract.
    ///         Explicitly forbidden from ever withdrawing the GRAD token
    ///         itself — this is the one line standing between "owner can
    ///         clean up a mistaken transfer" and "owner can drain user
    ///         deposits and reward funds," so it is enforced in code, not
    ///         just by policy.
    function recoverERC20(address tokenAddress, uint256 amount) external onlyOwner {
        require(tokenAddress != address(gradToken), "GradStaking: cannot withdraw staking/reward token");
        IERC20(tokenAddress).safeTransfer(owner(), amount);
        emit Recovered(tokenAddress, amount);
    }
}
