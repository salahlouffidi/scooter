# Release hardening branch

Rollback baseline: `12dca866b7ba86dc19a32d704783a5811426154a`, also saved as GitHub branch `checkpoint/working-production-ads-2026-10-30`.

This branch supersedes the older README's statements that consent integration and optimization are absent. Each change is a separate commit; use `git revert <commit>` on the branch to undo a particular step, resolving dependent changes together where necessary. Main remains at its working version until validation and merge.

Implemented:
- Settings opens an offline readable privacy policy and privacy-choice entry point.
- UMP 4.0.0 refreshes at launch; ads initialize and load only when UMP permits them. Failed consent collection does not grant permission; previous UMP permission can be reused after an update error.
- Production App ID and ad units unchanged; Google Mobile Ads stays at the phone-tested 25.4.0. No sample IDs or debug geography forced.
- Fragment/Fragment KTX constrained to stable 1.9.1 if present transitively. Actual dependency resolution must confirm selected versions. No unverified wholesale dependency upgrade.
- R8/resource shrinking enabled for RELEASE only, JavaScript interface method names preserved, mapping included in release artifacts. Debug is not shrunk.
- One in-flight preload per format, cached ads cleared on privacy changes and Activity destruction, stale callbacks discarded. These are bounded-loading/lifecycle fixes, not proof the Play memory warning has been resolved.

Validation:
- Existing gameplay suite and simulated ad-flow checks run locally.
- A separate no-secrets PR workflow compiles/lints/shrinks the release and records Fragment dependency insight. Workflow result must be checked; configuration alone is not a successful build.
- Signed release phone testing still required: consent accept/reject/privacy reopen, unavailable form/offline first start, interstitial close, earned/cancelled reward, duplicate callbacks, second loss, background/foreground, force stop, low-memory device. Test on registered AdMob test devices, keeping production unit IDs.

Account work still required:
- Publish an appropriate consent message assigned to SKY SCOOTER App ID `ca-app-pub-3521560929268417~8016739665`. The existing ARMASNAKE message does not apply. Integrating UMP alone is not a declaration of compliance.
- Confirm public policy deployment and use its HTTPS URL in Play Console and the Scooter message.
- Configure existing upload-key secrets and run signed candidate workflow; provide internal-test build for phone QA.
- Native memory/CPU profiling needs an adb device or emulator; none is available here. No fabricated performance figures or promises about Play warning percentages.

Primary sources checked on 30 October 2026:
- https://developers.google.com/admob/android/privacy
- https://dl.google.com/dl/android/maven2/com/google/android/ump/user-messaging-platform/maven-metadata.xml
- https://dl.google.com/dl/android/maven2/androidx/fragment/fragment/maven-metadata.xml
