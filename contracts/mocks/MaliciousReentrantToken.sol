// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MaliciousReentrantToken
/// @notice TEST-ONLY MOCK. Simulates a hostile/hooked token (unlike real
///         GRAD) that tries to reenter a target contract mid-transfer, so we
///         can verify our nonReentrant guards actually hold even in the
///         worst case. Never deployed anywhere near production.
contract MaliciousReentrantToken is ERC20 {
    address public attackTarget;
    bytes public attackCalldata;
    bool public armed;

    bool public lastAttackSucceeded;
    bytes public lastAttackReturnData;
    uint256 public reentryAttempts;

    constructor() ERC20("Malicious", "EVIL") {
        _mint(msg.sender, 1_000_000_000 * 10 ** 18);
    }

    function arm(address target, bytes calldata data) external {
        attackTarget = target;
        attackCalldata = data;
        armed = true;
    }

    function disarm() external {
        armed = false;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        // Only trigger on genuine transfers (not mint/burn), and only once
        // per armed attack to avoid unbounded recursion muddying the result.
        if (armed && from != address(0) && to != address(0)) {
            armed = false; // disarm before firing so the reentrant call itself doesn't re-trigger
            reentryAttempts += 1;
            (bool ok, bytes memory ret) = attackTarget.call(attackCalldata);
            lastAttackSucceeded = ok;
            lastAttackReturnData = ret;
        }
    }
}
