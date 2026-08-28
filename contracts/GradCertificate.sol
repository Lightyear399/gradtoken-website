// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title GradCertificate
 * @notice Soulbound (non-transferable) on-chain credential for GradLearn course
 *         completions and partner-institution certifications.
 *
 * Design goals:
 *  - Non-transferable: once minted, a certificate is permanently bound to the
 *    recipient's wallet. It cannot be sold, gifted, or moved — this is what
 *    makes it trustworthy to an employer checking it on-chain.
 *  - Non-forgeable: only addresses holding MINTER_ROLE (GradLearn's backend)
 *    or INSTITUTION_ROLE (individually-approved partner institutions) can
 *    issue a certificate. Anyone else calling issueCertificate() reverts.
 *  - Publicly verifiable: any third party can call ownerOf(), balanceOf(),
 *    or getCertificate() directly against this contract with no API key,
 *    no login, and no trust in GradToken's own backend.
 *  - Revocable: DEFAULT_ADMIN_ROLE can revoke a wrongly-issued certificate.
 *    The token is burned, but the revocation itself is permanently logged
 *    via an emitted event with a stated reason — history isn't erased.
 */
contract GradCertificate is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant INSTITUTION_ROLE = keccak256("INSTITUTION_ROLE");

    struct Certificate {
        string courseName;      // e.g. "Solidity Fundamentals"
        string issuer;          // e.g. "GradLearn" or partner institution name
        uint64 completedAt;     // unix timestamp of completion
        uint8 score;            // 0-100, optional (0 if not applicable)
        string metadataURI;     // IPFS URI for extended metadata (syllabus, grade breakdown, etc.)
    }

    uint256 private _nextTokenId;

    mapping(uint256 => Certificate) private _certificates;

    // Prevents duplicate issuance of the same course to the same student.
    // keccak256(abi.encodePacked(student, courseName)) => already issued
    mapping(bytes32 => bool) public issued;

    event CertificateIssued(
        uint256 indexed tokenId,
        address indexed student,
        string courseName,
        string issuer,
        uint64 completedAt
    );

    event CertificateRevoked(
        uint256 indexed tokenId,
        address indexed student,
        string reason
    );

    error NonTransferable();
    error AlreadyIssued();
    error CertificateDoesNotExist();

    constructor(address admin) ERC721("GradToken Certificate", "GRADCERT") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    /**
     * @notice Issue a new certificate to a student.
     * @dev Callable by GradLearn's backend (MINTER_ROLE) for automatic
     *      on-chain course completions, or by an approved partner
     *      institution (INSTITUTION_ROLE) for manual issuance.
     */
    function issueCertificate(
        address student,
        string calldata courseName,
        string calldata issuerName,
        uint64 completedAt,
        uint8 score,
        string calldata metadataURI
    ) external returns (uint256 tokenId) {
        if (!hasRole(MINTER_ROLE, msg.sender) && !hasRole(INSTITUTION_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, MINTER_ROLE);
        }

        bytes32 dedupeKey = keccak256(abi.encodePacked(student, courseName));
        if (issued[dedupeKey]) revert AlreadyIssued();
        issued[dedupeKey] = true;

        tokenId = _nextTokenId++;
        _certificates[tokenId] = Certificate({
            courseName: courseName,
            issuer: issuerName,
            completedAt: completedAt,
            score: score,
            metadataURI: metadataURI
        });

        _safeMint(student, tokenId);

        emit CertificateIssued(tokenId, student, courseName, issuerName, completedAt);
    }

    /**
     * @notice Revoke a certificate (e.g. academic misconduct, erroneous
     *         issuance discovered after the fact). Burns the token but keeps
     *         a permanent on-chain record of the revocation and its reason.
     */
    function revoke(uint256 tokenId, string calldata reason) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address student = ownerOf(tokenId); // reverts if token doesn't exist
        _burn(tokenId);
        emit CertificateRevoked(tokenId, student, reason);
    }

    /// @notice Grant a verified partner institution the right to issue certificates.
    function approveInstitution(address institution) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(INSTITUTION_ROLE, institution);
    }

    /// @notice Revoke a partner institution's issuance rights (e.g. partnership ended, key compromised).
    function revokeInstitution(address institution) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(INSTITUTION_ROLE, institution);
    }

    /// @notice Read the full certificate record for a given token.
    function getCertificate(uint256 tokenId) external view returns (Certificate memory) {
        if (_ownerOf(tokenId) == address(0)) revert CertificateDoesNotExist();
        return _certificates[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert CertificateDoesNotExist();
        return _certificates[tokenId].metadataURI;
    }

    // ---- Soulbound enforcement ----
    // Overriding _update (OZ v5 ERC721 internal transfer hook) to block every
    // transfer except mint (from == address(0)) and burn (to == address(0)).
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert NonTransferable();
        }
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
