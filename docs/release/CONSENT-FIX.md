# Consent/ad loading corrections

Based on Google's `fd880c5735d4dd32b98a19dbdb870d298255bec3` push.

- Shared consent/initialization state gates all native ad loads and displays.
- Consent setup exceptions deny requests instead of bypassing UMP.
- Privacy options suspend ads, invalidate cached/in-flight requests, then re-read UMP permission.
- SDK initialization starts once; late initialization cannot override a revoked permission or destroyed Activity.
- Only one request per format is in flight; generation tokens reject old responses after clearing/destroying.
- Removed package-wide keep/dontwarn rules; preserve the annotated WebView bridge methods and rely on SDK consumer rules.
- JavaScript bridge has an explicit type so Android lint can inspect its annotated methods.
- Release mapping retained in artifacts; corrected CI's removed Android `tools` package default.

Unchanged: production App ID and both ad-unit IDs, Mobile Ads 25.4.0, UMP 3.1.0, Fragment 1.8.6, gameplay, graphics, reward amount and one-revive limit. This correction deliberately avoids a simultaneous SDK upgrade.

Validation: gameplay/ad-flow tests run locally; new JUnit tests cover initial/denied consent, duplicate initialization, revocation during SDK initialization, destruction and permitted retries. CI runs these plus lint and R8; check actual results before publishing. No native device is available locally, so consent display, optimized bridge and actual rewarded/interstitial ads still require phone QA with a registered test device.

AdMob must have a published message assigned to Scooter's App ID. Code alone does not configure that message or establish compliance. Public policy: https://salahlouffidi.github.io/sky-scooter-privacy.html
