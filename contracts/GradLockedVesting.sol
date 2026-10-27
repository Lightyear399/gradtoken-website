// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title GradLockedVesting
/// @notice One instance per group (team, investors, advisors). Cliff and duration are fixed at deploy and
///         identical for everyone in the group. Nothing vests until the owner sets a launch time (once,
///         never in the past), and every schedule starts at that launch time.
/// @dev    Release curve (confirmed schedules): nothing during the cliff, then linear over `duration`
///         seconds AFTER the cliff, with no lump at the cliff.
///         Team: cliff 12 months, duration 36. Investors: 12 and 24. Advisors: 6 and 18.
///         Revocation exists only if `revocable` was set at deploy; clawed-back tokens go to `clawbackTo`
///         (a treasury Safe), never to the owner, and the beneficiary keeps what had already vested.
contract GradLockedVesting is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Schedule {
        uint128 total;
        uint128 released;
        bool exists;
        bool revoked;
    }

    IERC20 public immutable grad;
    uint64 public immutable cliff;
    uint64 public immutable duration;
    bool public immutable revocable;
    address public immutable clawbackTo;

    uint64 public launchTime;          // 0 until set; set once; never in the past
    bool public schedulesLocked;       // one-way
    uint256 public totalAllocated;     // sum of schedule totals (reduced on revoke)
    uint256 public totalReleased;

    mapping(address => Schedule) private _schedules;
    address[] private _beneficiaries;

    event LaunchTimeSet(uint64 launchTime);
    event BeneficiaryAdded(address indexed beneficiary, uint256 amount);
    event SchedulesLocked();
    event Released(address indexed beneficiary, uint256 amount);
    event Revoked(address indexed beneficiary, uint256 vestedKept, uint256 clawedBack);
    event UnallocatedSwept(uint256 amount);

    error ZeroAddress();
    error InvalidSchedule();
    error LaunchAlreadySet();
    error LaunchInPast();
    error LaunchStarted();
    error Locked();
    error NotLocked();
    error Exists();
    error NoSchedule();
    error Underfunded();
    error NothingToRelease();
    error NotRevocable();
    error AlreadyRevoked();
    error RenounceDisabled();

    constructor(address grad_, address owner_, uint64 cliff_, uint64 duration_, bool revocable_, address clawbackTo_)
        Ownable(owner_)
    {
        if (grad_ == address(0) || owner_ == address(0) || clawbackTo_ == address(0)) revert ZeroAddress();
        if (duration_ == 0) revert InvalidSchedule();
        grad = IERC20(grad_);
        cliff = cliff_;
        duration = duration_;
        revocable = revocable_;
        clawbackTo = clawbackTo_;
    }

    // ------------------------------------------------------------- set up

    /// @notice Set once. The vesting clock for every schedule starts here.
    function setLaunchTime(uint64 t) external onlyOwner {
        if (launchTime != 0) revert LaunchAlreadySet();
        if (t < block.timestamp) revert LaunchInPast();
        launchTime = t;
        emit LaunchTimeSet(t);
    }

    /// @notice Add a beneficiary. Only before launch and before locking, and only up to what the contract holds.
    function addBeneficiary(address who, uint128 amount) external onlyOwner {
        if (schedulesLocked) revert Locked();
        if (launchTime != 0 && block.timestamp >= launchTime) revert LaunchStarted();
        if (who == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidSchedule();
        if (_schedules[who].exists) revert Exists();
        if (totalAllocated - totalReleased + amount > grad.balanceOf(address(this))) revert Underfunded();

        _schedules[who] = Schedule(amount, 0, true, false);
        _beneficiaries.push(who);
        totalAllocated += amount;
        emit BeneficiaryAdded(who, amount);
    }

    /// @notice One-way. After this no beneficiary can be added.
    function lockSchedules() external onlyOwner {
        schedulesLocked = true;
        emit SchedulesLocked();
    }

    /// @notice After locking, send tokens that were never assigned to anyone to the treasury Safe.
    function sweepUnallocated() external onlyOwner {
        if (!schedulesLocked) revert NotLocked();
        uint256 owed = totalAllocated - totalReleased;
        uint256 bal = grad.balanceOf(address(this));
        uint256 extra = bal > owed ? bal - owed : 0;
        if (extra > 0) grad.safeTransfer(clawbackTo, extra);
        emit UnallocatedSwept(extra);
    }

    // ------------------------------------------------------------ release

    function release() external nonReentrant {
        Schedule storage s = _schedules[msg.sender];
        if (!s.exists) revert NoSchedule();
        uint256 amount = _vested(s) - s.released;
        if (amount == 0) revert NothingToRelease();
        s.released += uint128(amount);
        totalReleased += amount;
        grad.safeTransfer(msg.sender, amount);
        emit Released(msg.sender, amount);
    }

    /// @notice Only if revocable. Beneficiary keeps everything vested so far; the rest goes to `clawbackTo`.
    function revoke(address who) external onlyOwner nonReentrant {
        if (!revocable) revert NotRevocable();
        Schedule storage s = _schedules[who];
        if (!s.exists) revert NoSchedule();
        if (s.revoked) revert AlreadyRevoked();
        uint256 vestedNow = _vested(s);
        uint256 unvested = s.total - vestedNow;
        s.total = uint128(vestedNow);
        s.revoked = true;
        totalAllocated -= unvested;
        if (unvested > 0) grad.safeTransfer(clawbackTo, unvested);
        emit Revoked(who, vestedNow, unvested);
    }

    // -------------------------------------------------------------- views

    function vestedAmount(address who) external view returns (uint256) {
        return _vested(_schedules[who]);
    }

    function releasable(address who) external view returns (uint256) {
        Schedule storage s = _schedules[who];
        return _vested(s) - s.released;
    }

    function scheduleOf(address who) external view returns (uint128 total, uint128 released, bool revoked) {
        Schedule storage s = _schedules[who];
        return (s.total, s.released, s.revoked);
    }

    function getBeneficiaries() external view returns (address[] memory) {
        return _beneficiaries;
    }

    // ----------------------------------------------------------- internal

    function _vested(Schedule storage s) internal view returns (uint256) {
        if (!s.exists) return 0;
        if (s.revoked) return s.total;                 // frozen at what had vested when revoked
        if (launchTime == 0) return 0;
        uint256 cliffEnd = uint256(launchTime) + cliff;
        if (block.timestamp < cliffEnd) return 0;
        uint256 elapsed = block.timestamp - cliffEnd;
        if (elapsed >= duration) return s.total;
        return (uint256(s.total) * elapsed) / duration;
    }

    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }
}
