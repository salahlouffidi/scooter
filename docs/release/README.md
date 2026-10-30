# SKY SCOOTER release preparation

Audit: 30 October 2026. Baseline: `347e4622d6f176e49d1fe27f3302f5569b0812b0`.

## Verified

- Interstitial works on the owner's phone (owner report).
- AdManager requests Scooter production units in every build: interstitial `9134380216`, rewarded `3871153080`, publisher `3521560929268417`.
- Manifest App ID ends `~8016739665`; SDK 25.4.0; minification disabled; no UMP.
- Package `com.aistudio.skyscooter.louffi`; versionCode 1, versionName 1.0; target 36, min 24.
- AdMob console: two active units; **Examen requis / Diffusion d'annonces limitée**, store not linked.
- AdMob European messages: published message belongs to ARMASNAKE only, not Scooter.
- Play Console account currently lists ARMASNAKE only; Scooter has not been created there.

## Release blockers and sequence

1. Review the privacy policy draft in this directory, confirm contact details and actual SDK data practices. Host the approved policy at a public HTTPS URL, then add an accessible in-app link. The draft has NOT been published or connected to the game.
2. Resolve consent for intended regions. Publishing an AdMob message alone does not display it in this app. There is currently no consent collection or gating before ad preload. No UMP added because the owner explicitly excluded it. A certified alternative requires integration and device testing. Do not mark this complete or assume non-personalized ads remove consent requirements.
3. Create SKY SCOOTER in Play Console, declare ads, complete app access, target audience, content rating and Data Safety. Choose the audience based on actual intended users; colorful graphics alone do not establish the age range. Account creation/declarations have NOT been submitted.
4. Review Data Safety worksheet below against the final signed artifact and SDK behavior; do not declare that no data is collected merely because gameplay is local.
5. Configure the existing upload key in GitHub Actions secrets (never commit it). Run the manual signed release workflow. Inspect lint results and artifact signature; upload to internal testing first.
6. Test the signed build on a physical phone using an AdMob registered test device. Complete the matrix below. Never click live ads to test.
7. Upload listing assets and reviewed store text, complete required testing shown by this account, then request production. Link the Play listing to Scooter in AdMob and complete app review / app-ads.txt verification.

## Data Safety worksheet — draft, not a submitted declaration

| Item | Evidence / required decision |
| --- | --- |
| Ads | Yes: Google Mobile Ads interstitial and rewarded |
| Approximate location | Review SDK IP-derived location collection/sharing |
| Device or other IDs | Review advertising ID and other SDK identifiers |
| App interactions | Review SDK ad views, taps and interactions |
| Diagnostics | Review SDK crash/performance/diagnostic collection |
| Purposes | Review advertising/marketing, analytics and fraud prevention/security for each type |
| Required/optional, ephemeral processing, sharing exemptions | Decide for each data type using actual final SDK configuration; do not infer from optional rewarded ads |
| Encryption | Verify SDK and app network paths before answering the global question |
| Accounts | No account/login flow found in reviewed game; verify final artifact |
| Local game data | Settings, scores, wallet, unlocks, run snapshot and adaptive difficulty weights; local storage/preferences; Android backup is enabled |
| Other dependencies | Gradle also includes Firebase AI and App Check; inspect initialization and merged manifest before final declaration |
| Deletion | Clearing app storage removes local saves; Android backup can restore data. Google manages its own ad data under its policy |

Reference pages to check when completing the form:
- https://developers.google.com/admob/android/privacy/play-data-disclosure
- https://developers.google.com/admob/android/privacy
- https://support.google.com/admob/answer/7666366

## Phone acceptance matrix — pending

| Scenario | Expected result |
| --- | --- |
| First loss | Loaded interstitial closes to Game Over |
| Reward completed | Resume with exactly one heart |
| Reward dismissed early | No heart awarded; Game Over remains usable |
| Second loss after revive | No second revive; no repeated interstitial in same run |
| New run | Revive becomes available again |
| Offline / no fill | Game Over remains usable; retry/menu work |
| Background during ad, then resume | No duplicate reward, stuck audio or frozen controls |
| Cold start / force stop / resume run | Progress, coins and controls consistent |
| All 16 rounds; low-memory phone | No crash or stuck transition; record FPS/thermal behavior |

## Signed AAB workflow

Run **Signed release candidate** manually on the reviewed branch. Required Actions secrets:
`UPLOAD_KEYSTORE_BASE64`, `STORE_PASSWORD`, `KEY_PASSWORD`. The configured alias is `upload`.
Use the existing upload key if the package was uploaded previously. Never create a replacement key casually.
The workflow uses the repository's Gradle 9.3.1 distribution version because executable wrapper files are absent.
It builds `:app:lintRelease :app:bundleRelease`, checks the AAB signature, uploads only AAB and lint reports, then removes the temporary key.
No build has been run successfully here: no Android SDK, Gradle executable or signing key is available in this workspace.
Do not call the AAB ready until the workflow succeeds and the Play internal-test upload accepts it.

## Scope protection

This preparation does not change AdManager, MainActivity, manifest, game.js, ad IDs, dependencies, graphics, gameplay, or minification. A separate branch preserves the phone-tested main version.
