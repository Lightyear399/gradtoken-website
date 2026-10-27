# GradToken Wave 1 Launch Plan

*Built from your decisions: no micro-rewards, no forced posting, no staking pool, no paid peer grading. Targets below are proposals, not facts.*

## 1. What launches first

Wave 1 is four courses, and the Business track isn't built yet. So the first cohort is smaller than the full wave:

- **Cohort 1 (Web3 Developer track):** Intro to Blockchain, then Solidity Basics. Solidity Basics is nearly built and Intro to Blockchain is cheap.
- **Cohort 2 (Business track):** Excel + Business Communication, then Data Analytics. It opens when those two courses pass their own test run.

Cohort 1 runs on **Base Sepolia**, so GRAD is test tokens with no value. Say that plainly in every message. Real-value rewards wait for the legal opinion, the audit and mainnet.

## 2. Cohort 1 design

| Item | Plan |
|---|---|
| Size | 30-50 learners. You review capstones by hand, so 50 capstones at about 15 minutes each is about 12 hours of review. |
| Length | 6 weeks. Weeks 1-2 Intro to Blockchain, weeks 3-6 Solidity Basics. |
| Rhythm | A fixed start date, weekly deadlines, a weekly live Q&A on Discord or Telegram, and a public completion leaderboard (completions, never token balances). |
| Rewards | Unchanged: 3.00 GRAD per course after exam and capstone, 1.00 GRAD per referral. Nothing for quizzes or posts. |
| Sharing | An optional share button on the certificate page. Never required to unlock anything. |
| Support | One Discord channel per course. Pin the review turnaround time. |

**Proposed targets:** 40 signups, 15 learners finishing Intro, 8 finishing Solidity, 5 or more certificates minted, 3 testimonials. Treat these as a starting guess and adjust after the first week.

## 3. Positioning

- Lead with the **job outcome** from the catalog, not "burnout" or token upside. Your learners want income-producing skills.
- Market each course on its own. Someone who wants Excel isn't automatically a Solidity learner, so skip the bundled "Full-Stack Web3 Professional" pitch.
- Channels from your plan: African tech communities and universities, WhatsApp and Telegram groups, the Reddit plan, X, and your Discord. Start with 10 hand-picked communities, not a broad blast.
- Honest line for every post: "Test network, test tokens, real skills and a certificate you can verify."

## 4. Public certificate page (built)

`backend/verify/` lets anyone enter a wallet and see its verified courses, read straight from the blockchain with no login. Learners can copy the link or share on LinkedIn or X, all optional. For the LinkedIn "Licenses and certifications" fields: issuing organization GradTech Africa, credential URL the verify page link.

## 5. Sponsor pitch

**Who to approach (5 targets a week, hand-picked):** Web3 startups that hire ops or data people, protocol or DAO ecosystem teams, Nigerian fintech and crypto firms, and tech hubs. Use a separate list from your investor list.

**The offer (pick one or combine):**
1. **Sponsor a course:** their logo on the course, plus a real dataset or case study in the capstone.
2. **First look:** early access to graduates who opt in to "Open to Work".
3. **Micro-bounty:** a paid, scoped task from their data for top graduates, agreed case by case.

**One-line pitch:** "Sponsor a course, shape the capstone, and get first access to the learners who finish it."

**Outreach email draft**
> Subject: Sponsor a course, meet the people who finish it
>
> Hi [name],
>
> I'm Olabode, founder of GradTech Africa and GradToken. We teach job-ready digital skills online (Solidity, Excel, data analytics) with verifiable on-chain certificates. Our first cohort starts [date].
>
> We're looking for two or three sponsors. You'd back one course, provide a real dataset or brief for its capstone, and get first access to graduates who opt in to hear from employers.
>
> Would a 15-minute call next week make sense? Cohort page: [link].
>
> Olabode

**Rules:** don't claim a partnership or imply a protocol endorses you until they've agreed in writing. Don't promise jobs or placement. Graduates are shared only if they opt in.

## 6. Timeline (weeks before cohort start)

| When | Do |
|---|---|
| -6 to -4 | Finish Solidity Basics content and exam UI. Build Intro to Blockchain. Deploy to Base Sepolia (checklist in DEPLOYMENT.md). |
| -4 to -2 | Run the end-to-end rehearsal with 3-5 friends. Fix what breaks. Publish the verify and rewards pages. Install the PWA. |
| -3 to 0 | Open signups with a waitlist, start 5 sponsor emails a week, post in 10 communities. |
| Start | Kickoff call, weekly deadlines begin. |
| Weeks 1-6 | Review capstones within 3 days. Track the metrics below. |

## 7. Metrics and the gate to Wave 2

Track weekly: signups, started, finished Intro, finished Solidity, median days to finish, review turnaround, referral sign-ups, support questions.
**Start Wave 2 only when** at least 5 learners have completed a full course end to end, the review turnaround is under 3 days, and no reward bug has appeared in the rehearsal or the cohort.

## 8. What this plan deliberately leaves out

- Rewards for quizzes, spreadsheets or social posts (farming risk, and your "no micro-rewards" rule).
- Forced posting to unlock tokens (promoting a token to get paid; ask your lawyer).
- A staking "commitment pool" (resembles a wager and means holding learner money; I'm not a lawyer).
- Paid peer grading (a second reward path outside the 2M GRAD cap, open to collusion). Unpaid peer review is fine as a learning exercise.
