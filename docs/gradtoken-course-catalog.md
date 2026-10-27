# GradToken Course Catalog

*20 courses, all learnable and practiced online. Every course follows the same rule: quizzes + exam + capstone, 3.00 GRAD paid once after all three pass. "Roles" are typical entry-level jobs or gigs a course prepares for, not guarantees of income.*

**Grading:** **Auto** = machine-checked (SQL results, code tests, numeric answers, seeded-bug lists). **Rubric** = a reviewer scores the capstone in the admin review screen. **Mixed** = both.
**Effort to build:** S, M or L, relative to what you've built for Solidity Basics.

## Wave 1: finish the loop

| Course (slug) | Roles it prepares for | Exam | Capstone | Grading | Effort |
|---|---|---|---|---|---|
| Solidity Basics (`solidity-basics`) | Junior smart contract developer, Web3 dev | Multiple choice + short code reasoning | Deployed contract + tests in a public repo | Mixed | Finish |
| Intro to Blockchain (`intro-to-blockchain`) | Crypto support, researcher, entry point to all Web3 roles | Multiple choice + scenarios | Written explainer of a real protocol | Rubric | S |
| Excel + Business Communication (`excel-business-communication`) | Admin, data entry to analyst, office roles | Numeric-answer problems on a given workbook | Cleaned sheet + one-page summary memo | Auto + short rubric | M |
| Data Analytics (`data-analytics`) | Junior data analyst, business analyst | SQL queries checked by output | Dataset analysis with a dashboard and findings | Mixed | M-L |

## Wave 2: needs the review flow

| Course (slug) | Roles it prepares for | Exam | Capstone | Grading | Effort |
|---|---|---|---|---|---|
| AI Literacy + Prompt Engineering (`ai-literacy`) | AI-assisted content or ops roles, prompt specialist, productivity consultant | Multiple choice + prompt tasks scored on a rubric | A documented AI workflow for a real task | Rubric | M |
| Web Development Basics (`web-dev-basics`) | Junior front-end dev, freelance site builder | Code challenges run against tests | A deployed multi-page site | Auto + rubric | L |
| Digital Marketing (`digital-marketing`) | Digital marketer, SEO or paid-ads assistant, social media manager | Multiple choice + case questions | A small real campaign with documented results | Rubric | M |
| Freelancing + Remote Work (`freelancing-remote-work`), includes a virtual assistant module | Freelancer, remote virtual assistant | Scenario questions on proposals, pricing, payments | A portfolio page + a mock client proposal | Rubric | S-M |
| Sales + Customer Success (`sales-customer-success`) | Sales development rep, customer success, support agent | Scenario questions | A recorded pitch + a WhatsApp selling exercise | Rubric | M |

## Wave 3: after real completions exist

| Course (slug) | Roles it prepares for | Exam | Capstone | Grading | Effort |
|---|---|---|---|---|---|
| Copywriting (`copywriting`) | Copywriter, content writer | Edit-this-copy tasks | 3 writing samples for a brief | Rubric | S |
| Short-Form Video + Content Creation (`short-form-video`) | Video editor, creator assistant | Multiple choice on editing, pacing and formats | A 5-video portfolio | Rubric | L |
| Graphic Design (`graphic-design`) | Graphic designer, social media designer | Multiple choice on design principles | A 5-piece brand kit | Rubric | M |
| Project Management + Agile (`project-management`) | Project coordinator, scrum support | Scenario exam | A project plan with risks and a timeline | Rubric | M |
| Python (`python`) | Junior developer, automation, data work | Code run against test files | A working script or small tool in a repo | Auto | M |
| Cybersecurity Fundamentals (`cybersecurity-fundamentals`) | Security analyst trainee, SOC support | Multiple choice + guided labs | A security review write-up of a practice target | Mixed | L |
| Community Management (`community-management`) | Community manager, Discord or Telegram moderator (strong in Web3) | Moderation scenarios | A 30-day community plan + a moderation playbook | Rubric | S |
| QA / Software Testing (`qa-testing`) | QA tester, test analyst | Find the seeded bugs in a sample app | A test plan + bug reports on a practice app | Auto + rubric | M |

## Wave 4: later

| Course (slug) | Roles it prepares for | Exam | Capstone | Grading | Effort |
|---|---|---|---|---|---|
| Technical Writing (`technical-writing`) | Docs writer, crypto and developer content | Edit-this-doc tasks | Documentation for a real small tool | Rubric | S-M |
| UI/UX Design (`ui-ux-design`) | Junior product or UI designer | Multiple choice + critique tasks | A clickable Figma prototype with a short case study | Rubric | M |
| Bookkeeping + Basic Accounting (`bookkeeping`) | Remote bookkeeper, accounts assistant | Numeric ledger problems | A full month of books for a sample business | Auto | M |

## Learning paths

- **Web3 Developer:** Solidity Basics, Web Dev Basics, Python, QA Testing, Cybersecurity Fundamentals
- **Crypto Foundations:** Intro to Blockchain, Community Management, Technical Writing
- **Content & Growth:** Digital Marketing, Copywriting, Short-Form Video, Graphic Design, Sales + Customer Success, Freelancing, AI Literacy
- **Data & Business (proposed fourth path):** Excel + Business Communication, Data Analytics, Project Management, Bookkeeping, UI/UX Design

## Left out for now

- **Data annotation / AI training:** pay and demand claims came from blogs, and basic data work is being automated. Revisit after verifying.

## When a course launches

1. Add its slug to `COURSES` and its rubric to the review config in `backend/netlify/functions/_lib/config.js`.
2. Build the quiz bank, a question bank larger than the exam draw, and the capstone brief.
3. Publish the same slug on the site. The certificate's course ID is `keccak256(slug)`, so never rename a slug after launch.
