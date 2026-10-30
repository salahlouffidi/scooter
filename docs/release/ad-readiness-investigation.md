# Ad readiness diagnosis and verification

Reviewed `main` at `fd880c5` before editing. The fix is isolated on `fix/ad-readiness-diagnostics`; existing PR branches were not merged or reused. No Mobile Ads, UMP, Android SDK, Gradle or dependency versions were changed.

## What the source proves

The first failed preload could leave a format unavailable indefinitely until another user action requested that format. In the reviewed `AdManager.kt`, both `onAdFailedToLoad` handlers at lines 124–128 and 156–160 only cleared the ad and loading flag, without retrying. Loads were restarted by `preload()` or display attempts. This explains a code-level failure to recover after a transient initial error; it does not prove why a particular request took approximately two minutes.

The reviewed `MainActivity.kt`, lines 249–287, could call `MobileAds.initialize` from the previous-session permission check and again from the consent completion/error callback. It had no initialization guard and its exception path initialized without checking UMP. Independently, the old manager's unavailable-ad display paths started a load without checking either consent or initialization completion. A revive tap could therefore bypass the intended consent-to-initialization chain.

The privacy-options callback ignored changed permission. Cached and in-flight results were not invalidated, and destroying an Activity did not dispose its manager or reject late callbacks. Although the old class comment claimed stale-callback protection, only per-format loading booleans were implemented. The old JavaScript Game Over flow hid its UI until a native completion callback, and unavailable reward callbacks did not show an error message.

There was no two-minute ad timer in the reviewed native or game ad code. The game's 3.2-second intro timer and countdown interval are unrelated. Google's initialization completion contract is SDK/adapter completion or a 30-second timeout, not an intentional two-minute display delay. Actual consent interaction, network request timeouts, no-fill and account restrictions remain separate possible contributors until runtime evidence is collected. [1]

A related recreation defect was found during lifecycle review: the saved run did not persist `revivesUsed`. Restoring an already revived run in a fresh game instance could reset the one-revive limit. The fix persists that field without changing health, scoring, physics or graphics, and accepts older saves that lack the metadata. Historical saves cannot reveal whether they already consumed a revive.

## Changed behavior

Every load is gated by a current UMP `canRequestAds()` check, the local privacy-change gate, and completed SDK initialization. Initialization is guarded once per process, and a destroyed Activity unsubscribes its completion listener. An unavailable display returns immediately; loading never retains a display continuation. Only an explicit, current Game Over request can display an interstitial. The Game Over menu is rendered before that request, so loading cannot hide or freeze it.

Each format has at most one SDK load and one scheduled retry. Failed loads get at most five automatic retries with delays of 2, 4, 8, 16 and 32 seconds, measured after each failed load callback. Repeated taps/preloads cannot skip a pending backoff. After the automatic budget is exhausted, a later explicit user display attempt may make another load request; there is no endless automatic loop. Successful loading resets the budget. Consent invalidation and Activity destruction cancel scheduled retries. An SDK load already in flight cannot be cancelled: its loading lock is retained until its callback, its generation is rejected, and a fresh permitted preload can then start without overlapping that request.

Opening privacy choices clears cached ads and invalidates in-flight results even if UMP permission remains true after the user's new choice. Permission is checked again after form completion/errors, initialization completion and foreground entry. A cache older than 55 minutes is discarded before use; cache expiry never schedules a display.

Native and JavaScript display callbacks are scoped to the requesting WebView document and a monotonic request ID. Duplicate or stale callbacks cannot grant a revive in a later run. Fullscreen ads are mutually exclusive. A rewarded dismissal grants a revive only if its reward-earned callback was received; early dismissal and show failure grant nothing. The awarded game state remains exactly one heart and one revive per run. The SDK's reward quantity/type is not used to change heart count. An unavailable revive promptly enables its button with `Ad unavailable, try again`; retry and menu navigation remain usable.

## Diagnostics and interpreting a delayed request

Filter local logcat with:

```sh
adb logcat -v threadtime SkyScooterAds:I '*:S'
```

Capture from process launch through consent completion, first Game Over and a revive attempt. Keep raw device logs private and redact unrelated SDK/device logs before sharing them. The application diagnostics add no advertising/device IDs, consent strings, account/player data, saved runs, location or ad request targeting. There is no analytics upload. SDK `LoadAdError` and `ResponseInfo` diagnostics are retained as supplied by the SDK.

Each diagnostic contains wall-clock `epochMs`, process-relative `elapsedMs`, an event sequence, stage and chunk number. Oversized SDK JSON is chunked rather than truncated. Correlate the stages:

```text
activity.create
ump.update.start -> ump.update.success / ump.update.failed
ump.form.start -> ump.form.complete
ump.check / ump.permission
sdk.init.start -> sdk.init.complete
preload -> load.start -> load.success / load.failed
retry.scheduled -> load.start, or retry.exhausted
display.request -> display.shown -> reward.earned / display.dismissed
```

The initialization log includes the exact production App ID and SDK version, then adapter states, latency and descriptions. Loads include exact ad-unit IDs, request number, consent generation and duration. Load failures include the complete `LoadAdError.toString()` and `ResponseInfo`; successful loads include `ResponseInfo` too. Fullscreen failures include full `AdError` and the ad's response info. Consent/form failures and exceptions are no longer swallowed. [2]

If the long gap precedes `ump.permission=true`, investigate consent update/form interaction or errors. If it lies between initialization start/completion, examine adapter initialization details. If it lies between `load.start` and its callback, it is SDK/network/serving latency rather than a UI wait; inspect the complete error domain, code, cause and adapter responses. A network/timeout error is not proof of no-fill. A no-fill result is not proof of a broken integration or a specific account restriction. Messages such as invalid unit/app configuration or account approval errors require different fixes. The code deliberately does not label all failures as no-fill. [2]

`load.stale`, `load.duplicate_callback`, `display.stale_or_background` and `ads.invalidate` expose rejected lifecycle races. No load-success callback calls `show()`. The added backoff is a recovery mechanism, not an explanation of the previously reported two-minute interval.

## Production configuration and safe testing

Both DEBUG and RELEASE continue using App ID `ca-app-pub-3521560929268417~8016739665`, interstitial `ca-app-pub-3521560929268417/9134380216`, and rewarded `ca-app-pub-3521560929268417/3871153080`. No demo units or personal device hashes were committed. Register each physical test device in the AdMob console before requesting ads with these units, and verify test labeling. Configure mediation networks' test modes separately if used. Do not click live production ads. UMP geography/debug testing requires its separate registered consent-test-device setup; do not ship forced geography or consent resets. [3]

On a registered test device, test first-install consent, saved consent, consent-update failure/offline launch, privacy-choice changes with a load in flight, repeated taps, network failure/reconnection, Game Over before ads load, late load success while playing, rewarded early dismissal versus completion, and background/foreground or Activity recreation during initialization/loading/fullscreen content. Verify that only a current Game Over can display an interstitial, no stale callbacks alter the next run, and a restored revived run still allows no second revive. Measure elapsed stages on both DEBUG and the optimized RELEASE build. Native simulated-SDK tests do not demonstrate actual serving or real-device behavior. [4] [5]

In the AdMob console, verify that this App ID corresponds to Android package `com.aistudio.skyscooter.louffi`, that the units belong to this app and have the expected formats, and that consent messages are published for the same app. Check app readiness/store linkage, account verification and approval, Policy center and ad-serving limits, app verification/app-ads.txt notices, frequency caps, mediation configuration and geographic fill. These checks need account access and cannot be inferred from source or a no-fill error alone. [6]

## Tests actually run

`npm test` passed on the clean baseline and on the changed tree: all five offline suites passed, covering game assets/rounds, controls/physics/scoring, run restoration, antigravity, flight effects and obstacle damage. `node tools/verify-ad-flow.cjs` passed with simulated native callbacks, covering visible Game Over before a native request, unavailable messaging, bridge exceptions, duplicate/stale callbacks, second loss, exactly one heart/revive and the actual saved-run serialization/restoration methods. No ads were requested by these tests.

The new `AdManagerReadinessTest` compiled and all 10 tests passed; the ordinary `ExampleUnitTest` also passed. The ad logic tests run Robolectric API 28 with a paused looper, LEGACY graphics and Conscrypt OFF, using injected loaders and a handwritten rewarded-ad fake. They cover readiness gating, per-format concurrency, all five backoff delays, pending-retry protection, consent rechecks, privacy invalidation, stale/duplicate callbacks, destruction, immediate unavailable completion and reward confirmation before dismissal delivery. No app/SDK version or existing test was changed to achieve this. Initial attempts on API 36 hit the unsupported Linux ARM64 Robolectric runtime; the no-network logic tests also needed native Conscrypt disabled because that host library is unavailable.

The complete `:app:testDebugUnitTest` run executed 13 tests: 11 passed and 2 failed. The unchanged `ExampleRobolectricTest` and `GreetingScreenshotTest` fail during setup with `The Robolectric native runtime is not supported on Linux (aarch64)`. Both failures also occurred on the isolated clean baseline, where the ordinary unit test passed. Therefore the complete suite is not green on this host. Rerun those API 36/native-graphics tests on a supported x86_64 runner.

Release lint passed without a baseline or new suppression. Its earlier `JavascriptInterface` error resolved to Compose's generic `T`, despite the compiled bridge methods retaining the annotation. Registration through a concrete typed helper fixed detection without changing the bridge's runtime API. The existing warnings remain; unrelated lint/graphics cleanup was deliberately not included.

Optional CLI Chromium checks were run in a disposable source copy to avoid changing graphics or tracked screenshots. Controls, graphics, antigravity and HUD clarity passed. The aggregate `npm run test:browser` and flight browser command failed: smoke timed out clicking a round card, obstacle damage failed its `barrel` assertion, session timed out on the hidden pause-menu button, and flight effects timed out taking a screenshot. All four failing components reproduced with the same signatures on a fresh archive of `fd880c5`. They are preexisting failures, not claimed passes. Baseline `npm ci` also failed because the existing lockfile and package manifest are out of sync; optional testing used an exact Playwright 1.64.1 install in the disposable copy without changing either repository manifest.

No physical device, Android emulator ad flow, AdMob-console access or real/test ad serving was exercised. Compilation, simulated callbacks and CLI Chromium results do not establish real-device success.

## Optimized release actually verified

The final changed tree passed `:app:assembleRelease :app:bundleRelease :app:lintRelease` with the existing release minification and resource-shrinking settings enabled. Gradle 9.3.1, Java 21 and Android platform/build tools 36.1 were provisioned outside the repository. An external QEMU-backed AAPT2 override was needed because the sandbox is ARM64 and the packaged Linux AAPT2 is x86_64. No committed build, dependency, SDK-version or shrinking configuration was changed.

APK signature verification passed, including APK Signature Scheme v2. AAB verification returned `jar verified`. Both artifacts use an external throwaway self-signed key, **not the production upload/signing key**. AAB verification emits certificate-chain and archive-verifier warnings; these are not production-signing approval. Do not publish these temporary-key artifacts or use them to replace a production-signed installation.

The final APK is 5,653,465 bytes, SHA-256 `3cf0018e3237afc1681bfb226fe5d84d7284d229d2a333d5908543528eceef88`. The AAB is 10,199,372 bytes, SHA-256 `39c2b9ed99dec555dab8cfb68717b92ca4a88e19a78add384b4ea2421e1e5798`. Both were generated from the tested changed tree. Artifact inspection confirmed the exact production App ID in DEBUG and RELEASE merged manifests, both production units in release DEX, no Google demo publisher ID in DEX, retained diagnostic stage strings and bridge R8 mapping, and byte-identical packaged `game.js`/`runSession.js` versus source.

Reproduce on a normal supported Android build host with the unchanged project versions and a suitable local verification key:

```sh
npm test
node tools/verify-ad-flow.cjs
gradle --no-daemon :app:testDebugUnitTest
gradle --no-daemon :app:assembleRelease :app:bundleRelease :app:lintRelease
```

Supply `KEYSTORE_PATH`, `STORE_PASSWORD` and `KEY_PASSWORD` through the existing environment-based signing configuration. Production signing and a registered physical device still need separate validation. The complete unit-test command above is intentionally reported as failing on this ARM64 sandbox because of the two unchanged native-runtime tests, not as a passed full suite.

## Files changed

`MainActivity.kt` now coordinates consent, guarded SDK initialization, privacy updates, lifecycle disposal and current-request bridge checks. `ads/AdManager.kt` gates and serializes loading, invalidates stale results, retries with bounds, logs SDK responses and completes unavailable displays immediately. `ads/AdDiagnostics.kt` adds timestamped chunked local logs. `ads/MobileAdsInitializer.kt` provides the process-wide initialization guard without retaining an Activity.

`game/js/game.js` renders Game Over immediately and scopes ad requests/callbacks while preserving the earned one-heart revive. `game/js/runSession.js` persists consumed revive usage across recreation. `tools/verify-ad-flow.cjs` exercises the actual game/session methods with simulated native callbacks. `AdManagerReadinessTest.kt` adds native no-network loader tests. This document records evidence and remaining checks.

## References

[1]: https://developers.google.com/admob/android/quick-start "Google Mobile Ads Android initialization contract"
[2]: https://developers.google.com/admob/android/ad-load-errors "Google Mobile Ads full load error diagnostics"
[3]: https://developers.google.com/admob/android/test-ads "Test production units on registered test devices"
[4]: https://developers.google.com/admob/android/privacy "UMP permissions, redundant requests and privacy choices"
[5]: https://developers.google.com/admob/android/rewarded "Reward-earned and fullscreen callback behavior"
[6]: https://support.google.com/admob/answer/10564477?hl=en "AdMob app readiness and account restrictions"
