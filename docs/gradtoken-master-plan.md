# GradToken Master Plan

*Consolidated from the full planning conversation, 29 Sep 2026. Items are marked **Decided**, **Proposed** (my default, awaiting your yes) or **Open**.*

## 1. Where you are now

- **Built:** Sepolia contracts (token, vesting, staking, soulbound certificate), live website, exam backend, mission gating, rebuilt dashboard. Solo, bootstrapped, pre-seed round in progress ($500K target).
- **Not built yet:** Mission 01-04 lesson pages, mini-tests, boss-fight submissions, capstone path, exam-taking UI, exam-review flow, certificate minting, reward claims, AI tutor.
- **Bottleneck:** the course-to-certificate loop. Everything else depends on real users completing it.

## 2. Decided

- **Reward discipline:** one small fixed reward per full course, paid only after exam and capstone. No micro-rewards for lessons or quizzes. Annual emission cap on the learning pool.
- **Talent pathway:** opt-in "Open to Work"; companies browse verified certificate holders.
- **Gates before mainnet:** token legal opinion, professional audit, multisig with limited admin roles.
- **Platform:** apps for phones and laptops, plus a separate website.
- **Certificates:** one soulbound token per wallet, with each completed course added as a record (instead of one token per course).
- **Chain:** production on Base (confirmed).
- **Reward pool:** Community/Ecosystem bucket moves into a claims-only rewards contract with an annual cap; long vesting stays on team, investor and liquidity unlocks (accepted).
- **Referral rewards:** defaults in section 3 accepted.
- **Launch sequence:** waves in section 4 accepted.
- **Naming:** GradTech Africa is the company; GradToken is the product and token. The token name and symbol stay as they are, so no rename before the Base deploy.

## 3. Token and rewards

- **No mining.** GRAD is fixed-supply with no mint function. Users earn it through courses and qualified referrals.
- **Reward pool (Decided):** move the Community/Ecosystem bucket into a rewards contract that only pays through course claims, capped per year. Keep the long cliffs and vesting on team, investor and liquidity unlocks, since those matter more for circulation than the cap.
- **Course reward (Decided):** 3.00 GRAD per course, split across components (proposed weights: quizzes 0.75, exam 1.00, capstone 1.25). Accrues by component but is claimed in one payout after exam and capstone pass, so nothing pays per quiz. Referral stays 1.00 GRAD.
- **Annual cap (Decided):** 2M GRAD in year 1 for course and referral rewards combined, reviewed yearly.
- **Tokenomics (Decided):** keep the deployed split: Community/Ecosystem 350M, Team 180M, Treasury 150M, Public Sale/Liquidity 120M, Investors 100M, Marketing 60M, Advisors 40M. Team and advisors stay at 22%. Inside Community/Ecosystem, 300M goes to the claims-only rewards contract and 50M stays in the Community Safe for grants and partner incentives.
- **Vesting (Decided):** Team 180M: 12-month cliff + 36 months linear. Investors 100M: 12-month cliff + 24 months linear. Advisors 40M: 6-month cliff + 18 months linear. If investors push back, concede on their cliff first (down to 6-9 months) and never shorten the team schedule. The clock should start at token launch, and release should be cliff-then-linear (no lump at the cliff date). Verify both in the vesting contract before the Base deploy.
- **Chain (Decided):** production on Base, an Ethereum L2 with the same tooling and cheaper gas for small claims. Test on Base Sepolia first. This means redeploying every contract, and the site's addresses all change.

### Referral rewards (Decided)
- Paid only when the referred person passes exam and capstone on their first course.
- Referrer gets 1.00 GRAD per qualified referral, capped at 20 per year, drawn from the same annual cap.
- Referrer must hold a certificate. Referral link locks at signup. One wallet per account, no self-referral.
- 7-day hold before claim. Flag any referrer with more than 5 qualified referrals in 30 days.
- Mechanism: backend signs an EIP-712 voucher; `claimReferral` on the rewards contract pays once per referee. The signing key is a limited hot key; admin stays in the Safe.

### Trading after launch
- DEX first on Base (Uniswap or Aerodrome) using the Liquidity/Public Sale bucket, with locked liquidity and modest depth.
- Centralized exchanges later, on their terms.
- Open trading only after the legal opinion, and after a period of real completions.

## 4. Courses

**Research basis (summary):** World Bank job-posting analysis (Nigeria, Kenya, South Africa, Uganda) shows demand for data analysis, SQL, JavaScript and about 40% transversal skills like communication. The WEF found 63% of Sub-Saharan African organisations short of cybersecurity staff. Kenya's 2026 hiring report says employers lack job-ready, verifiable talent, which supports on-chain credentials. Marketing, social media, Excel, business development, sales and customer success appear heavily in job listings and creator-economy demand. Caveat: entry-level data entry and basic support are being automated. Most salary and market-size figures came from blogs, so treat them as rough.

**Launch sequence (Decided)**

| Wave | Courses | Grading |
|---|---|---|
| 1 | Solidity Basics, Intro to Blockchain, Excel + Business Communication, Data Analytics (Excel/SQL/Power BI) | Auto-graded |
| 2 | AI Literacy + Prompt Engineering, Web Dev Basics, Digital Marketing, Freelancing/Remote Work, Sales + Customer Success | Rubric review (needs exam-review flow) |
| 3 | Copywriting, Short-Form Video, Graphic Design, Project Management, Python, Cybersecurity Fundamentals | Mixed |

Solidity Basics' final exam has free-response sections, so it is not fully auto-graded (see section 10). Rules: every course has an exam and a capstone; start the next wave only once the previous one has real completions; build the exam-review flow before Wave 2; group courses into the Web3 Developer, Crypto Foundations and Content & Growth paths.

## 5. Platform

- **Website:** keep as the marketing and investor site.
- **Web app:** one installable PWA on an `app.` subdomain, working in any browser and installable on phones and desktops. Phone for reading, quizzes and claims; laptop for coding capstones, with the same login.
- **Wallets:** WalletConnect, plus consider email login with a created wallet for beginners.
- **Store apps:** later, by wrapping the web app with Capacitor. Check Apple and Google crypto and token-reward policies first.
- **Domains:** a company domain for GradTech Africa (investors, legal, hiring) and a product domain for GradToken, with the app on `app.` under the product domain. Register both before launch.

## 6. Talent pathway and money

- **Pathway:** opt-in profile flag; read-only certificate lookup page (works with the contract, no backend trust); manual pilot with 2-5 companies before building company accounts.
- **Revenue ideas:** company success fees or subscriptions, premium cohorts, verified project or pro certificate upgrades, sponsorships, white-label courses.
- **Budget reality:** the original plan's $83K-$207K assumed a six-person team. The lean version is $60K-$90K. Your pre-seed raise is what pays for the legal opinion and audit, the two items you can't do yourself.

## 7. Security and legal

- Move certificate admin and other admin roles from the deployer wallet to a Safe, and add a second owner.
- Get quotes for a token legal opinion (from a lawyer who knows Nigerian SEC rules) and a smart contract audit.
- Continue the existing CAC incorporation and SEC VASP roadmap and the fundraising outreach.

## 8. Roadmap (solo-realistic)

**Days 1-30**
- Check the vesting contract: linear release after the cliff (no lump), and clock start at launch. All reward, chain, referral, tokenomics and vesting decisions are made.
- Finish Solidity Basics end to end on Sepolia (lessons, exam UI, capstone, minting).

**Days 31-60**
- Update `GradCertificate` to one token per wallet with records.
- Build the rewards contract and claim flow.
- Ship Intro to Blockchain and Excel/Business Communication.
- Turn the site into the installable PWA.

**Days 61-90**
- Run a testnet cohort of real users and collect completion data.
- Start the manual employer pilot.
- Get legal and audit quotes and update the raise.

**Before mainnet:** legal opinion done, audit done, admin roles in a multisig, treasury wallets in place. Then deploy to Base, open a small locked-liquidity DEX pool, and start Wave 2.

## 9. Key risks

- Too many parallel tracks; hold to the course-to-certificate loop.
- Reward farming once GRAD has value; the exam gate and referral hold are the defense.
- Regulatory classification once trading opens.
- Manual grading load in Wave 2; build the review flow first.
- App store crypto rules.

## 10. Fixes from the review

1. **Exam-review flow is needed for Wave 1, not just Wave 2.** Solidity Basics has manually graded sections, and today that means editing Supabase tables by hand. Build the review flow before any reward pays out.
2. **Rewards must rest on server-verified results.** Course progress is currently self-reported, so claim vouchers may only be signed from server-side exam and capstone results.
3. ~~Set the course reward before the referral reward.~~ Done: course 3.00, referral 1.00.
4. ~~Settle the canonical tokenomics split before the Base deploy.~~ Done: deployed split kept.
5. ~~Split the Community/Ecosystem bucket.~~ Done: 300M rewards, 50M grants.
6. **Add anti-farming beyond one wallet per account.** Use email verification, exam attempt cooldowns and a rotating question bank (the current bank is 48 questions).
7. **Add data protection, Terms and Privacy** before collecting real learner data or sharing profiles with employers (Nigeria's data protection law applies). Get these with the legal opinion.
8. **Trim the schedule.** Days 31-60 as written is too heavy for one person. Do the certificate update, the rewards contract and the PWA there, and move Intro to Blockchain and Excel later, or ship Wave 1 as two courses first.
