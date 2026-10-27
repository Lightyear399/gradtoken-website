// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @dev ERC-5192 minimal soulbound interface.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
    function locked(uint256 tokenId) external view returns (bool);
}

/// @title GradCertificate v2
/// @notice One soulbound certificate per wallet. Each completed course is a record on
///         that single token. Issued by the GradToken backend (MINTER_ROLE) or an
///         approved partner institution (INSTITUTION_ROLE). Publicly verifiable
///         with no backend trust: tokenURI is generated on-chain from the records.
contract GradCertificate is ERC721, AccessControl, IERC5192 {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant INSTITUTION_ROLE = keccak256("INSTITUTION_ROLE");

    struct Record {
        bytes32 courseId;
        bytes32 evidence; // hash of the capstone / project submission
        address issuer;
        uint64 issuedAt;
        bool active;
    }

    mapping(address => Record[]) private _records;
    mapping(address => uint256) public courseCount; // active records only
    mapping(address => mapping(bytes32 => bool)) public hasCourse;
    string public imageURI;

    event CourseIssued(address indexed learner, bytes32 indexed courseId, address indexed issuer, bytes32 evidence);
    event CourseRevoked(address indexed learner, bytes32 indexed courseId, address indexed by, string reason);
    event ImageURIUpdated(string imageURI);

    error Soulbound();
    error NotIssuer();
    error ZeroAddress();
    error InvalidCourse();
    error AlreadyIssued();
    error NotRevoker();
    error NoSuchRecord();

    constructor(address admin, address minter) ERC721("GradToken Certificate", "GRADCERT") {
        if (admin == address(0) || minter == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
    }

    // --------------------------------------------------------------- issuing

    /// @notice Add a completed course to the learner's certificate (minting it on first course).
    function issueCourse(address learner, bytes32 courseId, bytes32 evidence) external {
        if (!hasRole(MINTER_ROLE, msg.sender) && !hasRole(INSTITUTION_ROLE, msg.sender)) revert NotIssuer();
        if (learner == address(0)) revert ZeroAddress();
        if (courseId == bytes32(0)) revert InvalidCourse();
        if (hasCourse[learner][courseId]) revert AlreadyIssued();

        uint256 tokenId = tokenIdOf(learner);
        if (_ownerOf(tokenId) == address(0)) {
            _mint(learner, tokenId);
            emit Locked(tokenId);
        }

        _records[learner].push(Record(courseId, evidence, msg.sender, uint64(block.timestamp), true));
        hasCourse[learner][courseId] = true;
        courseCount[learner] += 1;
        emit CourseIssued(learner, courseId, msg.sender, evidence);
    }

    /// @notice Revoke a course record (admin, or the issuer that created it). Burns the
    ///         token when the last active record is revoked. The reason stays in the event log.
    function revokeCourse(address learner, bytes32 courseId, string calldata reason) external {
        Record[] storage recs = _records[learner];
        for (uint256 i = 0; i < recs.length; i++) {
            if (recs[i].courseId == courseId && recs[i].active) {
                if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && msg.sender != recs[i].issuer) revert NotRevoker();
                recs[i].active = false;
                hasCourse[learner][courseId] = false;
                courseCount[learner] -= 1;
                emit CourseRevoked(learner, courseId, msg.sender, reason);
                if (courseCount[learner] == 0) {
                    _burn(tokenIdOf(learner));
                }
                return;
            }
        }
        revert NoSuchRecord();
    }

    function setImageURI(string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        imageURI = uri;
        emit ImageURIUpdated(uri);
    }

    // ----------------------------------------------------------------- views

    function tokenIdOf(address learner) public pure returns (uint256) {
        return uint256(uint160(learner));
    }

    function getCertificate(address learner) external view returns (uint256 tokenId, Record[] memory active) {
        tokenId = tokenIdOf(learner);
        Record[] storage recs = _records[learner];
        active = new Record[](courseCount[learner]);
        uint256 j;
        for (uint256 i = 0; i < recs.length; i++) {
            if (recs[i].active) active[j++] = recs[i];
        }
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        address learner = _requireOwned(tokenId);
        Record[] storage recs = _records[learner];
        bytes memory courses;
        bool first = true;
        for (uint256 i = 0; i < recs.length; i++) {
            if (!recs[i].active) continue;
            courses = abi.encodePacked(courses, first ? bytes("") : bytes(","), _recordJson(recs[i]));
            first = false;
        }
        bytes memory json = abi.encodePacked(
            '{"name":"GradToken Certificate","description":"Soulbound proof of completed courses issued by GradTech Africa.",',
            '"image":"', imageURI, '","total_courses":', Strings.toString(courseCount[learner]),
            ',"courses":[', courses, "]}"
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    function _recordJson(Record storage r) private view returns (bytes memory) {
        return abi.encodePacked(
            '{"courseId":"', Strings.toHexString(uint256(r.courseId), 32),
            '","issuedAt":', Strings.toString(r.issuedAt),
            ',"issuer":"', Strings.toHexString(r.issuer),
            '","evidence":"', Strings.toHexString(uint256(r.evidence), 32), '"}'
        );
    }

    // ------------------------------------------------------------ soulbound

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function supportsInterface(bytes4 id) public view override(ERC721, AccessControl) returns (bool) {
        return id == 0xb45a3c0e || super.supportsInterface(id);
    }
}
