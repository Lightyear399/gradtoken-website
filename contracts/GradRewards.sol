// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title GradRewards
/// @notice Claims-only GRAD rewards pool. GRAD leaves this contract only through
///         (a) a course-completion claim or (b) a referral claim, each authorised
///         by an EIP-712 voucher from the backend signer, and each counted against
///         a yearly emission cap.
/// @dev The contract fixes the amounts, so a compromised signer can only unlock
///      the fixed reward for a real (learner, course) or (referrer, referee) pair,
///      never choose an amount. Admin (a Safe) sets the signer, amounts and cap.
contract GradRewards is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bytes32 private constant COURSE_TYPEHASH =
        keccak256("CourseClaim(address learner,bytes32 courseId,uint256 deadline)");
    bytes32 private constant REFERRAL_TYPEHASH =
        keccak256("ReferralClaim(address referrer,address referee,uint256 qualifiedAt,uint256 deadline)");

    uint256 public constant HOLD_PERIOD = 7 days;
    uint256 public constant EPOCH_LENGTH = 365 days;
    uint256 public constant MAX_REFERRALS_PER_EPOCH = 20;

    IERC20 public immutable grad;
    IERC721 public immutable certificate;
    uint256 public immutable startTime;

    address public voucherSigner;
    uint256 public courseReward;
    uint256 public referralReward;
    uint256 public annualCap;

    mapping(uint256 epoch => uint256 amount) public emittedInEpoch;
    mapping(address learner => mapping(bytes32 courseId => bool)) public courseClaimed;
    mapping(address referee => bool) public refereePaid;
    mapping(address referrer => mapping(uint256 epoch => uint256 count)) public referralsInEpoch;

    event CourseRewardClaimed(address indexed learner, bytes32 indexed courseId, uint256 amount);
    event ReferralRewardClaimed(address indexed referrer, address indexed referee, uint256 amount);
    event VoucherSignerUpdated(address indexed signer);
    event RewardsUpdated(uint256 courseReward, uint256 referralReward);
    event AnnualCapUpdated(uint256 annualCap);

    error ZeroAddress();
    error InvalidAmounts();
    error Expired();
    error AlreadyClaimed();
    error BadSignature();
    error CapExceeded();
    error HoldActive();
    error NoCertificate();
    error SelfReferral();
    error ReferralLimit();
    error CannotRecoverGrad();

    constructor(
        address grad_,
        address certificate_,
        address admin,
        address signer,
        uint256 courseReward_,
        uint256 referralReward_,
        uint256 annualCap_
    ) EIP712("GradRewards", "1") {
        if (grad_ == address(0) || certificate_ == address(0) || admin == address(0) || signer == address(0)) {
            revert ZeroAddress();
        }
        _checkAmounts(courseReward_, referralReward_);
        grad = IERC20(grad_);
        certificate = IERC721(certificate_);
        startTime = block.timestamp;
        voucherSigner = signer;
        courseReward = courseReward_;
        referralReward = referralReward_;
        annualCap = annualCap_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------------- claims

    /// @notice Learner claims the course reward after the backend has verified
    ///         exam + capstone pass. One claim per (learner, course).
    function claimCourseReward(bytes32 courseId, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
    {
        if (block.timestamp > deadline) revert Expired();
        if (courseClaimed[msg.sender][courseId]) revert AlreadyClaimed();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(COURSE_TYPEHASH, msg.sender, courseId, deadline))
        );
        if (ECDSA.recover(digest, signature) != voucherSigner) revert BadSignature();

        courseClaimed[msg.sender][courseId] = true;
        uint256 amount = courseReward;
        _spend(amount);
        grad.safeTransfer(msg.sender, amount);
        emit CourseRewardClaimed(msg.sender, courseId, amount);
    }

    /// @notice Referrer claims after the referee qualified (exam + capstone on
    ///         their first course) and the 7-day hold has passed.
    function claimReferral(address referee, uint256 qualifiedAt, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
    {
        if (referee == msg.sender) revert SelfReferral();
        if (block.timestamp > deadline) revert Expired();
        if (refereePaid[referee]) revert AlreadyClaimed();
        if (block.timestamp < qualifiedAt + HOLD_PERIOD) revert HoldActive();
        if (certificate.balanceOf(msg.sender) == 0) revert NoCertificate();

        uint256 epoch = _currentEpoch();
        if (referralsInEpoch[msg.sender][epoch] >= MAX_REFERRALS_PER_EPOCH) revert ReferralLimit();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(REFERRAL_TYPEHASH, msg.sender, referee, qualifiedAt, deadline))
        );
        if (ECDSA.recover(digest, signature) != voucherSigner) revert BadSignature();

        refereePaid[referee] = true;
        referralsInEpoch[msg.sender][epoch] += 1;
        uint256 amount = referralReward;
        _spend(amount);
        grad.safeTransfer(msg.sender, amount);
        emit ReferralRewardClaimed(msg.sender, referee, amount);
    }

    // ----------------------------------------------------------------- views

    function currentEpoch() external view returns (uint256) {
        return _currentEpoch();
    }

    function remainingCapThisEpoch() external view returns (uint256) {
        uint256 used = emittedInEpoch[_currentEpoch()];
        return used >= annualCap ? 0 : annualCap - used;
    }

    // ----------------------------------------------------------------- admin

    function setVoucherSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (signer == address(0)) revert ZeroAddress();
        voucherSigner = signer;
        emit VoucherSignerUpdated(signer);
    }

    function setRewards(uint256 courseReward_, uint256 referralReward_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _checkAmounts(courseReward_, referralReward_);
        courseReward = courseReward_;
        referralReward = referralReward_;
        emit RewardsUpdated(courseReward_, referralReward_);
    }

    function setAnnualCap(uint256 annualCap_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        annualCap = annualCap_;
        emit AnnualCapUpdated(annualCap_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Rescue tokens sent here by mistake. GRAD itself can never be
    ///         withdrawn: the pool is claims-only by design.
    function recoverERC20(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(grad)) revert CannotRecoverGrad();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    // -------------------------------------------------------------- internal

    function _currentEpoch() internal view returns (uint256) {
        return (block.timestamp - startTime) / EPOCH_LENGTH;
    }

    function _spend(uint256 amount) internal {
        uint256 epoch = _currentEpoch();
        uint256 newTotal = emittedInEpoch[epoch] + amount;
        if (newTotal > annualCap) revert CapExceeded();
        emittedInEpoch[epoch] = newTotal;
    }

    function _checkAmounts(uint256 courseReward_, uint256 referralReward_) internal pure {
        // Referral must never pay more than the learner earns for a course.
        if (courseReward_ == 0 || referralReward_ == 0 || referralReward_ > courseReward_) {
            revert InvalidAmounts();
        }
    }
}
