// EIP-712 voucher signing. Types and domain must match GradRewards.sol exactly.
const domain = (chainId, verifyingContract) => ({ name: "GradRewards", version: "1", chainId, verifyingContract });
const COURSE_TYPES = {
  CourseClaim: [
    { name: "learner", type: "address" },
    { name: "courseId", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
};
const REFERRAL_TYPES = {
  ReferralClaim: [
    { name: "referrer", type: "address" },
    { name: "referee", type: "address" },
    { name: "qualifiedAt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};
const signCourse = (signer, { chainId, verifyingContract }, learner, courseId, deadline) =>
  signer.signTypedData(domain(chainId, verifyingContract), COURSE_TYPES, { learner, courseId, deadline });
const signReferral = (signer, { chainId, verifyingContract }, referrer, referee, qualifiedAt, deadline) =>
  signer.signTypedData(domain(chainId, verifyingContract), REFERRAL_TYPES, { referrer, referee, qualifiedAt, deadline });
module.exports = { signCourse, signReferral };
