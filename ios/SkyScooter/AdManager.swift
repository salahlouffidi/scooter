import UIKit
import GoogleMobileAds
import UserMessagingPlatform

/// iOS twin of the Android AdManager: UMP consent first, then one interstitial
/// and one rewarded ad kept preloaded. Stale callbacks are dropped by session id.
final class AdManager: NSObject, FullScreenContentDelegate {

    private let interstitialUnit: String
    private let rewardedUnit: String

    private var interstitial: InterstitialAd?
    private var rewarded: RewardedAd?
    private var loadingInterstitial = false
    private var loadingRewarded = false
    private var session = 0
    private var started = false

    private var onInterstitialDone: (() -> Void)?
    private var rewardEarned = false
    private var onRewardResult: ((Bool) -> Void)?   // true = earned
    private var onRewardUnavailable: (() -> Void)?

    override init() {
        let info = Bundle.main.infoDictionary ?? [:]
        interstitialUnit = info["SSInterstitialAdUnit"] as? String ?? ""
        rewardedUnit = info["SSRewardedAdUnit"] as? String ?? ""
        super.init()
    }

    var canRequestAds: Bool { ConsentInformation.shared.canRequestAds }

    var privacyOptionsRequired: Bool {
        ConsentInformation.shared.privacyOptionsRequirementStatus == .required
    }

    /// Ask for consent (shows the form only where the law requires it), then start ads.
    func start(from host: UIViewController, onConsentChanged: @escaping () -> Void) {
        ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters()) { [weak self] _ in
            ConsentForm.loadAndPresentIfRequired(from: host) { _ in
                self?.startAdsIfAllowed()
                onConsentChanged()
            }
        }
        startAdsIfAllowed()
    }

    func showPrivacyOptions(from host: UIViewController, onDone: @escaping () -> Void) {
        invalidate()
        ConsentForm.presentPrivacyOptionsForm(from: host) { [weak self] _ in
            guard let self else { return }
            if self.canRequestAds { self.startAdsIfAllowed(); self.preload() } else { self.invalidate() }
            onDone()
        }
    }

    private func startAdsIfAllowed() {
        guard canRequestAds, !started else { return }
        started = true
        MobileAds.shared.start { [weak self] _ in
            DispatchQueue.main.async { self?.preload() }
        }
    }

    func invalidate() {
        session += 1
        interstitial = nil
        rewarded = nil
        loadingInterstitial = false
        loadingRewarded = false
    }

    func preload() {
        guard canRequestAds, started else { return }
        loadInterstitial()
        loadRewarded()
    }

    var isRewardedReady: Bool { canRequestAds && rewarded != nil }

    private func loadInterstitial() {
        guard canRequestAds, interstitial == nil, !loadingInterstitial, !interstitialUnit.isEmpty else { return }
        loadingInterstitial = true
        let s = session
        InterstitialAd.load(with: interstitialUnit, request: Request()) { [weak self] ad, _ in
            DispatchQueue.main.async {
                guard let self, s == self.session else { return }
                self.loadingInterstitial = false
                self.interstitial = ad
                ad?.fullScreenContentDelegate = self
            }
        }
    }

    private func loadRewarded() {
        guard canRequestAds, rewarded == nil, !loadingRewarded, !rewardedUnit.isEmpty else { return }
        loadingRewarded = true
        let s = session
        RewardedAd.load(with: rewardedUnit, request: Request()) { [weak self] ad, _ in
            DispatchQueue.main.async {
                guard let self, s == self.session else { return }
                self.loadingRewarded = false
                self.rewarded = ad
                ad?.fullScreenContentDelegate = self
            }
        }
    }

    /// Always calls `done` exactly once, immediately if no ad is ready.
    func showInterstitial(from host: UIViewController, done: @escaping () -> Void) {
        guard canRequestAds, let ad = interstitial else {
            loadInterstitial()
            done()
            return
        }
        interstitial = nil
        onInterstitialDone = done
        ad.present(from: host)
    }

    func showRewarded(from host: UIViewController,
                      unavailable: @escaping () -> Void,
                      result: @escaping (Bool) -> Void) {
        guard canRequestAds, let ad = rewarded else {
            loadRewarded()
            unavailable()
            return
        }
        rewarded = nil
        rewardEarned = false
        onRewardResult = result
        onRewardUnavailable = unavailable
        ad.present(from: host) { [weak self] in
            self?.rewardEarned = true
        }
    }

    // MARK: FullScreenContentDelegate

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        finish(ad, failed: false)
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        finish(ad, failed: true)
    }

    private func finish(_ ad: FullScreenPresentingAd, failed: Bool) {
        if ad is InterstitialAd {
            let cb = onInterstitialDone
            onInterstitialDone = nil
            loadInterstitial()
            cb?()
        } else if ad is RewardedAd {
            let result = onRewardResult
            let unavailable = onRewardUnavailable
            onRewardResult = nil
            onRewardUnavailable = nil
            loadRewarded()
            if failed { unavailable?() } else { result?(rewardEarned) }
        }
    }
}
