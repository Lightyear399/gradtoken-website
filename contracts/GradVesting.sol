// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GradVesting
/// @notice Cliff + linear-vesting contract for GRAD's Team, Investor, and
///         Advisor allocations. One contract instance is deployed per bucket
///         (team / investors / advisors) so each keeps an independent GRAD
///         balance and schedule set, matching the tokenomics doc:
///           - Team:      12mo cliff, then linear over 24mo
///           - Investors:  6mo cliff, then linear over 18mo
///           - Advisors:  12mo cliff, then linear over 18mo
/// @dev Security notes:
///  - Follows checks-effects-interactions: released amount is calculated and
///    the internal `released` accounting is updated BEFORE the external
///    token transfer, closing the standard reentrancy hole.
///  - `nonReentrant` guard on `release` as defense-in-depth even though GRAD
///    itself has no hooks (not ERC-777/ERC-677), in case this contract is
///    ever reused for a token that does.
///  - Uses SafeERC20 rather than raw `transfer` so it works correctly even
///    with non-standard ERC-20s that don't return a bool.
///  - `onlyOwner` (Ownable2Step, so ownership transfer requires the new
///    owner to accept — no accidental transfer-to-dead-address) can create
///    schedules and, only if explicitly marked revocable at creation, revoke
///    the *unvested* remainder of a schedule. Already-vested tokens always
///    belong to the beneficiary and can never be clawed back, regardless of
///    revocation — this protects the beneficiary from a unilateral rug.
///  - Per-beneficiary schedule IDs prevent one beneficiary's schedule from
///    being overwritten by a second grant; each grant is independently
///    tracked and independently released.
contract GradVesting is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct VestingSchedule {
        address beneficiary;
        uint256 totalAmount;
        uint256 released;
        uint64 startTime; // unix timestamp vesting clock begins
        uint64 cliffDuration; // seconds after startTime before ANY tokens vest
        uint64 vestingDuration; // seconds over which tokens linearly vest, AFTER the cliff
        bool revocable;
        bool revoked;
    }

    IERC20 public immutable token;

    VestingSchedule[] private _schedules;
    mapping(address => uint256[]) private _schedulesByBeneficiary;

    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed beneficiary,
        uint256 totalAmount,
        uint64 startTime,
        uint64 cliffDuration,
        uint64 vestingDuration,
        bool revocable
    );
    event TokensReleased(uint256 indexed scheduleId, address indexed beneficiary, uint256 amount);
    event ScheduleRevoked(uint256 indexed scheduleId, uint256 unvestedReturned);

    constructor(address tokenAddress, address initialOwner) Ownable(initialOwner) {
        require(tokenAddress != address(0), "GradVesting: zero token");
        token = IERC20(tokenAddress);
    }

    /// @notice Create a new vesting schedule. Requires the contract to already
    ///         hold enough unallocated GRAD (transferred in at deployment via
    ///         GradToken's constructor, or top-up later).
    function createSchedule(
        address beneficiary,
        uint256 totalAmount,
        uint64 startTime,
        uint64 cliffDuration,
        uint64 vestingDuration,
        bool revocable
    ) external onlyOwner returns (uint256 scheduleId) {
        require(beneficiary != address(0), "GradVesting: zero beneficiary");
        require(totalAmount > 0, "GradVesting: zero amount");
        require(vestingDuration > 0, "GradVesting: zero duration");
        require(
            token.balanceOf(address(this)) >= _totalUnreleasedCommitted() + totalAmount,
            "GradVesting: insufficient contract balance for new schedule"
        );

        scheduleId = _schedules.length;
        _schedules.push(
            VestingSchedule({
                beneficiary: beneficiary,
                totalAmount: totalAmount,
                released: 0,
                startTime: startTime,
                cliffDuration: cliffDuration,
                vestingDuration: vestingDuration,
                revocable: revocable,
                revoked: false
            })
        );
        _schedulesByBeneficiary[beneficiary].push(scheduleId);

        emit ScheduleCreated(scheduleId, beneficiary, totalAmount, startTime, cliffDuration, vestingDuration, revocable);
    }

    /// @notice Release all currently-vested, unreleased tokens for a schedule
    ///         to its beneficiary. Callable by anyone (e.g. the beneficiary,
    ///         or a relayer/automation on their behalf) — funds always go to
    ///         the fixed beneficiary address, never to the caller.
    function release(uint256 scheduleId) external nonReentrant {
        VestingSchedule storage schedule = _schedules[scheduleId];
        require(schedule.beneficiary != address(0), "GradVesting: no such schedule");

        uint256 releasable = _releasableAmount(schedule);
        require(releasable > 0, "GradVesting: nothing to release");

        // Effects before interaction.
        schedule.released += releasable;

        emit TokensReleased(scheduleId, schedule.beneficiary, releasable);
        token.safeTransfer(schedule.beneficiary, releasable);
    }

    /// @notice Revoke the unvested remainder of a schedule (only if it was
    ///         created with revocable = true). Already-vested-but-unclaimed
    ///         tokens are first released to the beneficiary, then the
    ///         remainder returns to the contract owner. This mirrors how
    ///         real token vesting works when a team member departs early.
    function revoke(uint256 scheduleId) external onlyOwner nonReentrant {
        VestingSchedule storage schedule = _schedules[scheduleId];
        require(schedule.beneficiary != address(0), "GradVesting: no such schedule");
        require(schedule.revocable, "GradVesting: not revocable");
        require(!schedule.revoked, "GradVesting: already revoked");

        uint256 releasable = _releasableAmount(schedule);
        uint256 unvested = schedule.totalAmount - schedule.released - releasable;

        schedule.revoked = true;
        if (releasable > 0) {
            schedule.released += releasable;
        }
        // Shrink totalAmount so future _releasableAmount() calls (there are
        // none possible after revocation, but this keeps accounting honest)
        // and _totalUnreleasedCommitted() reflect reality.
        schedule.totalAmount = schedule.released;

        emit ScheduleRevoked(scheduleId, unvested);
        if (releasable > 0) {
            emit TokensReleased(scheduleId, schedule.beneficiary, releasable);
            token.safeTransfer(schedule.beneficiary, releasable);
        }
        if (unvested > 0) {
            token.safeTransfer(owner(), unvested);
        }
    }

    /// @notice View: amount currently claimable for a schedule.
    function releasableAmount(uint256 scheduleId) external view returns (uint256) {
        return _releasableAmount(_schedules[scheduleId]);
    }

    /// @notice View: total amount that has already vested (claimed or not) for a schedule.
    function vestedAmount(uint256 scheduleId) external view returns (uint256) {
        return _vestedAmount(_schedules[scheduleId]);
    }

    function scheduleCount() external view returns (uint256) {
        return _schedules.length;
    }

    function getSchedule(uint256 scheduleId) external view returns (VestingSchedule memory) {
        return _schedules[scheduleId];
    }

    function schedulesOf(address beneficiary) external view returns (uint256[] memory) {
        return _schedulesByBeneficiary[beneficiary];
    }

    function _releasableAmount(VestingSchedule storage schedule) internal view returns (uint256) {
        return _vestedAmount(schedule) - schedule.released;
    }

    function _vestedAmount(VestingSchedule storage schedule) internal view returns (uint256) {
        if (schedule.totalAmount == 0) return 0;

        uint256 cliffEnd = uint256(schedule.startTime) + uint256(schedule.cliffDuration);
        if (block.timestamp < cliffEnd) {
            return 0;
        }

        uint256 vestingEnd = cliffEnd + uint256(schedule.vestingDuration);
        if (block.timestamp >= vestingEnd) {
            return schedule.totalAmount;
        }

        uint256 timeIntoVesting = block.timestamp - cliffEnd;
        return (schedule.totalAmount * timeIntoVesting) / schedule.vestingDuration;
    }

    /// @dev Sum of (totalAmount - released) across all non-revoked schedules,
    ///      used to ensure new schedules never over-commit the contract's
    ///      actual token balance.
    function _totalUnreleasedCommitted() internal view returns (uint256 sum) {
        uint256 len = _schedules.length;
        for (uint256 i = 0; i < len; i++) {
            VestingSchedule storage s = _schedules[i];
            sum += (s.totalAmount - s.released);
        }
    }
}
