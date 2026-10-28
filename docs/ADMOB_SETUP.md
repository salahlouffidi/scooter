# SKY SCOOTER — AdMob and international privacy setup

## What is in code now

- Google Mobile Ads SDK and Google UMP dependencies are included.
- UMP consent information/form flow is requested at app startup.
- Mobile Ads initialization is gated on `ConsentInformation.canRequestAds()`.
- The ad manager supports rewarded and interstitial formats and uses Google's official test ad-unit IDs only.
- The manifest uses Google's official demo AdMob App ID. This is a development placeholder, not SKY SCOOTER's production identity.

**Important:** the ad manager is currently a foundation. The game UI does not yet call rewarded/interstitial methods, and the privacy-options form is not yet connected to a visible settings button. Do not consider monetization or privacy setup finished until those are wired and tested.

## What you must do in AdMob

1. Sign in to Google AdMob with the Google account that will own SKY SCOOTER's monetization.
2. Add a new Android app. If the app is not yet published on Google Play, choose the option that it is not listed/published yet.
3. Use this exact Android package name: `com.aistudio.skyscooter.louffi`. Do not reuse ARMASNAKE's app entry or ad units.
4. Copy the new SKY SCOOTER **AdMob App ID** (format `ca-app-pub-...~...`) and create separate **Rewarded** and **Interstitial** ad units (format `ca-app-pub-.../... `).
5. Keep test IDs in development. Before production, replace the demo manifest App ID and test ad-unit IDs with the values created for SKY SCOOTER. Never paste credentials or private keys into source control.
6. In AdMob > Privacy & messaging, configure and publish the applicable European regulations message (including EEA, UK and Switzerland as applicable) and any other message required for your distribution. Verify the message is available for this app.
7. Add your real public privacy-policy URL to the Play Console store listing and make sure the policy explains advertising, data processing, consent choices, and how users can contact you.
8. Complete Google Play Console's Ads declaration, Data safety form, target audience/age settings, and content rating accurately. Do not claim that no data is collected if the SDK and your actual app behavior mean otherwise.
9. If you use app-ads.txt, host a valid file on the developer website/domain registered in AdMob and verify the crawler status in AdMob.
10. Request an internal testing release first. Check consent behavior in the EEA and non-EEA, offline startup, ad-load failures, app background/resume, and real-device behavior. Use only test ads and never click your own live ads.
11. After you have verified the app, configured real IDs, and checked AdMob review/ad-serving status, prepare the closed test and then production release.

## International targeting checklist

- Google Play country/region availability and AdMob ad serving are separate settings; verify both.
- UMP determines whether a consent form is required for the current user and whether ad requests can be made. Do not hardcode a country list as a substitute for consent.
- Provide an in-app entry point to privacy options when UMP reports that privacy options are required. The helper exists in `AdsConsentManager`, but a visible game settings/menu control still needs to be connected.
- If the app targets children or mixed audiences, reassess the ad SDK configuration, treatment, content and policy requirements before launch.
- Never promise that ads will serve in every country; availability depends on account status, demand, policies and regional rules.

## Code files added/changed

- `app/src/main/java/com/example/ads/AdManager.kt`
- `app/src/main/java/com/example/ads/AdsConsentManager.kt`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/com/example/MainActivity.kt`
- `app/build.gradle.kts`

## Verification still required

The repository was updated remotely; no Android build or device test was run as part of these commits. Run:

```powershell
.\gradlew.bat assembleDebug
```

Then install and test the debug APK on a physical Android device. Fix build/runtime issues before uploading an AAB to Play Console.
