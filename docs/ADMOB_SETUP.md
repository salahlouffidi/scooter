# Scooter: ads, privacy and Android release checks

Package: `com.aistudio.skyscooter.louffi`. This is a separate AdMob application. No other game's app ID or ad units are used.

## Implementation

- Google Mobile Ads 25.5.0 and UMP 4.0.0. UMP refreshes at startup; initialization, loads and shows require `canRequestAds()`. Consent errors never automatically grant permission.
- Settings exposes **Privacy choices** when UMP requires it. Opening the form invalidates cached/in-flight ads; returning rechecks consent before reloading.
- A voluntary **WATCH AD · +50 COINS** button on Game Over and World Complete. The SDK earned callback is the only grant signal. One reward transaction per run; closing early, failures and duplicate callbacks do not grant extra coins.
- Interstitials are considered only when the player leaves a result screen (retry, next world, replay or menu). At least two result exits and 120 seconds since startup/last full-screen ad are required. No fill continues immediately; ads never appear later on top of active riding.
- No banners or app-open ads. Browser previews do not show native AdMob ads.
- Ad load retries are throttled to 30 seconds, cached ads expire after 55 minutes, full-screen shows are serialized, and resources are cleared with the activity.

## Create the Scooter entry in your existing AdMob account

1. Add an Android app named **SKY SCOOTER — LOUFFI EDITION**. Mark it as not listed if it is not yet on Google Play; link the correct listing when available.
2. Copy the new **App ID** (`ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX`).
3. Create a **Rewarded** unit and an **Interstitial** unit. Copy each ID (`ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX`). Set the rewarded unit's display reward to **50 coins**, matching the in-game offer.
4. Configure/publish the applicable messages under **Privacy & messaging** for this app, including European regulations and relevant US state messages for intended distribution.
5. Provide a public Scooter privacy policy, and accurate Play Console Ads, Data safety, audience and content-rating declarations. The current implementation does not implement a mixed-audience age screen; settle the target audience and required child/under-age treatment before release.
6. Verify the developer website/app-ads.txt association and AdMob app readiness separately from Play approval.

Only the three public AdMob identifiers are needed for code configuration. Never supply a Google password, OAuth secret or signing private key in a chat or repository.

## Build configuration

Set values in your local `~/.gradle/gradle.properties` or environment:

```properties
SCOOTER_ADMOB_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
SCOOTER_ADMOB_REWARDED_ID=ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
SCOOTER_ADMOB_INTERSTITIAL_ID=ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
```

| Variant | IDs | Optimization | Purpose |
| --- | --- | --- | --- |
| debug | Google test ad units; Scooter App ID if supplied, demo App ID otherwise | No minification | Development |
| adQa | Google test ad units; same App ID selection | R8 + resource shrinking | Sideload release-like testing; package ends in `.adqa` |
| release | Scooter's three identifiers required; demo IDs rejected | R8 + resource shrinking | Signed store bundle after verification |

**UMP end-to-end testing needs a real configured Scooter App ID and published privacy messages.** The demo App ID alone does not prove consent forms will work; if UMP denies requests after a configuration error, the app correctly does not load ads. Debug/adQa always retain test ad units even when a real App ID is supplied. Test forced EEA/non-EEA geography only with UMP's official registered-test-device settings in a local test build; never ship geography overrides or consent resets.

Use Android Studio with Gradle 9.3.1, JDK 17 and Android SDK 36.1. The existing repository has no `gradlew` launcher/JAR; CI installs the declared Gradle version directly. With Gradle installed:

```sh
npm test
gradle :app:assembleDebug :app:assembleAdQa :app:lintAdQa :app:testDebugUnitTest
gradle :app:dependencyInsight --dependency androidx.fragment --configuration releaseRuntimeClasspath
```

Install `app/build/outputs/apk/adQa/app-adQa.apk` for obfuscated test-ad QA. `adQa` uses a generated debug key and a different package, and is not a store release. The release build keeps the existing keystore environment configuration (`KEYSTORE_PATH`, `STORE_PASSWORD`, `KEY_PASSWORD`, alias `upload`). Configure signing securely, then run `gradle :app:bundleRelease`.

## Google Play warnings addressed in code, still requiring artifact/device verification

| Warning | Change | Required verification |
| --- | --- | --- |
| DEX obfuscation 1% | R8 optimization/obfuscation and resource shrinking in release/adQa. Only annotated JavaScript bridge methods have explicit keep rules. Removed unused Firebase, Room, networking and icon template dependencies. | Build AAB; inspect `BUNDLE-METADATA/com.android.tools/r8.json`, mapping and final DEX. Do not infer a 25%+ score from configuration alone. |
| Fragment 1.1.0 obsolete | A dependency constraint raises Fragment to 1.9.1 if it is present transitively. | Check resolved runtime dependency report and final bundle/SDK Index. |
| Edge-to-edge / deprecated window parameters | Activity 1.13.0; retain `enableEdgeToEdge()`, remove manual decor-fit/cutout overrides, propagate system/cutout/mandatory-gesture insets into the HUD CSS. | Android 15/16, gesture and three-button navigation, display cutouts, rotation, SDK-owned ad/consent windows. |
| Orientation / resizing | Remove landscape lock, enable resizing, keep existing responsive UI and renderer resize behavior. | Phone/tablet/foldable, portrait/landscape, split screen and repeated resizing during a saved run. |
| Memory | Removed unused native dependencies and clear ad caches with activity lifecycle. | No memory profile has been captured; test long sessions, repeated ad cycles, WebView recreation and low-memory recovery on devices. |

International availability is selected in **Play Console**, not hardcoded in this app. Review countries for the intended testing/production track. UMP decides applicable consent requirements; international targeting does not automatically clear AdMob readiness or policy reviews.

## Verification record for this change

- Passed locally: five existing Node gameplay suites plus the new ad bridge behavior suite (`npm test`).
- Passed locally: JavaScript syntax and `git diff --check`.
- Android compilation, R8 output, lint, actual SDK ads/consent and device rendering are **not yet verified**. This work environment lacks Android SDK/Gradle; downloading Gradle was blocked (HTTP 403).
- Browser visual tests were **not run**: Chromium download was blocked (HTTP 403).
- `.github/workflows/android-ads-check.yml` runs core tests and attempts debug/adQa builds, lint and unit tests, retaining APKs, mapping and reports. Inspect the actual run; adding CI is not evidence it passes.

Before store upload, test consent accept/decline/reopen, offline startup/no fill, early dismissal vs earned rewards, double taps, app background/resume, minimized release bridges, orientation/resize, and memory on at least a modest phone and a modern tablet/foldable. Check the resulting bundle in Play Console; warnings from an older application's version are not evidence about this new bundle.

Official references: [UMP](https://developers.google.com/admob/android/privacy), [Ads SDK releases](https://developers.google.com/admob/android/rel-notes), [DEX optimization](https://developer.android.com/topic/performance/vitals/code-optimization), [Fragment](https://developer.android.com/jetpack/androidx/releases/fragment), [Edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge), [Adaptive layouts](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability).
