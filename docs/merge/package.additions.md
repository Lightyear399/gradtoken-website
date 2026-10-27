# Add to your existing package.json (do NOT replace the file)

Run:
```
npm install --save ethers@^6 @supabase/supabase-js@^2
npm install --save-dev jsdom@^25 qrcode@^1.5
```
Your sign-in code also needs `jsonwebtoken` and `cookie` in **dependencies**. Keep the versions your repo already pins (your `session.js` uses the older `cookie.serialize` API, so `cookie@^0.7`, not 1.x). If either is missing: `npm install --save jsonwebtoken cookie@^0.7`.

Add these scripts:
```json
"deploy:token-suite:base-sepolia": "hardhat run scripts/deploy-token-suite.js --network baseSepolia",
"deploy:core:base-sepolia": "hardhat run scripts/deploy-core.js --network baseSepolia",
"check:core:base-sepolia": "hardhat run scripts/check-core.js --network baseSepolia",
"test:pwa": "node --test tests-node/"
```
