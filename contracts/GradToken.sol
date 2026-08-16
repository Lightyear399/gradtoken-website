// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title GradToken (GRAD)
/// @notice Fixed-supply ERC-20 for the GradToken learn-to-earn ecosystem.
/// @dev Security notes:
///  - Supply is minted exactly once, in the constructor, and split immediately
///    into the seven tokenomics buckets. There is NO mint function anywhere in
///    this contract or its parents, so total supply can never change after
///    deployment — this removes an entire class of "hidden inflation" / rug risk.
///  - Uses OpenZeppelin's audited ERC20 implementation rather than a hand-rolled
///    one; Solidity 0.8.x has built-in overflow/underflow reverts.
///  - ERC20Permit (EIP-2612) is included so GradStake and future GradLearn
///    contracts can accept gasless approvals — a UX win with no extra attack
///    surface on this contract itself.
///  - ERC20Burnable lets holders voluntarily burn their own tokens; it cannot
///    be used to burn anyone else's balance.
///  - No owner/admin role exists on this contract at all. Nobody — including
///    the deployer — can pause transfers, blacklist addresses, or mint more
///    GRAD. What you deploy is what exists, forever. This is a deliberate
///    trust-minimization choice: it's one less thing an auditor or a
///    community member has to take on faith.
contract GradToken is ERC20, ERC20Burnable, ERC20Permit {
    /// @notice Total fixed supply: 1,000,000,000 GRAD (18 decimals).
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Allocation breakdown, in basis points of TOTAL_SUPPLY (sum = 10_000).
    uint16 public constant BPS_COMMUNITY_ECOSYSTEM = 3_500; // 35% -> rewards pool (feeds GradStake)
    uint16 public constant BPS_TEAM = 1_800; // 18% -> vesting contract
    uint16 public constant BPS_TREASURY = 1_500; // 15% -> treasury multisig
    uint16 public constant BPS_PUBLIC_SALE_LIQUIDITY = 1_200; // 12% -> public sale/liquidity wallet
    uint16 public constant BPS_INVESTORS = 1_000; // 10% -> vesting contract
    uint16 public constant BPS_MARKETING = 600; // 6% -> marketing wallet
    uint16 public constant BPS_ADVISORS = 400; // 4% -> vesting contract

    /// @param communityEcosystemPool Address that will fund GradStake rewards (e.g. the staking contract's reward funder, or a multisig that periodically tops it up).
    /// @param teamVesting Address of the deployed vesting contract handling team schedules.
    /// @param treasury Treasury/DAO reserve multisig.
    /// @param publicSaleLiquidity Wallet/contract for public sale + DEX liquidity.
    /// @param investorVesting Address of the deployed vesting contract handling investor schedules.
    /// @param marketing Marketing & community growth wallet.
    /// @param advisorVesting Address of the deployed vesting contract handling advisor schedules.
    constructor(
        address communityEcosystemPool,
        address teamVesting,
        address treasury,
        address publicSaleLiquidity,
        address investorVesting,
        address marketing,
        address advisorVesting
    ) ERC20("GradToken", "GRAD") ERC20Permit("GradToken") {
        require(communityEcosystemPool != address(0), "GRAD: zero address");
        require(teamVesting != address(0), "GRAD: zero address");
        require(treasury != address(0), "GRAD: zero address");
        require(publicSaleLiquidity != address(0), "GRAD: zero address");
        require(investorVesting != address(0), "GRAD: zero address");
        require(marketing != address(0), "GRAD: zero address");
        require(advisorVesting != address(0), "GRAD: zero address");

        uint256 communityAmt = (TOTAL_SUPPLY * BPS_COMMUNITY_ECOSYSTEM) / 10_000;
        uint256 teamAmt = (TOTAL_SUPPLY * BPS_TEAM) / 10_000;
        uint256 treasuryAmt = (TOTAL_SUPPLY * BPS_TREASURY) / 10_000;
        uint256 publicSaleAmt = (TOTAL_SUPPLY * BPS_PUBLIC_SALE_LIQUIDITY) / 10_000;
        uint256 investorsAmt = (TOTAL_SUPPLY * BPS_INVESTORS) / 10_000;
        uint256 marketingAmt = (TOTAL_SUPPLY * BPS_MARKETING) / 10_000;
        uint256 advisorsAmt = (TOTAL_SUPPLY * BPS_ADVISORS) / 10_000;

        // Mint the full fixed supply directly into the seven buckets. This is
        // the only _mint call that exists anywhere in the contract's lifetime.
        _mint(communityEcosystemPool, communityAmt);
        _mint(teamVesting, teamAmt);
        _mint(treasury, treasuryAmt);
        _mint(publicSaleLiquidity, publicSaleAmt);
        _mint(investorVesting, investorsAmt);
        _mint(marketing, marketingAmt);
        _mint(advisorVesting, advisorsAmt);

        // Sanity check: the buckets must exactly equal total supply, with any
        // integer-division dust (if it existed) accounted for. With these
        // exact percentages there is no dust, but this assertion protects
        // against a future edit to the BPS constants introducing rounding
        // loss silently.
        assert(
            communityAmt + teamAmt + treasuryAmt + publicSaleAmt + investorsAmt + marketingAmt + advisorsAmt
                == TOTAL_SUPPLY
        );
    }
}
