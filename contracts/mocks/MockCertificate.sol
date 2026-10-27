// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
contract MockCertificate is ERC721 {
    uint256 private _next;
    constructor() ERC721("GradCertificate", "GRADCERT") {}
    function mint(address to) external { _mint(to, ++_next); }
}
