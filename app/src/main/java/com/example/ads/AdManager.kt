package com.example.ads

import android.app.Activity
import android.content.Context
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.rewarded.RewardItem

/**
 * Centralized ad manager for SKY SCOOTER.
 *
 * This initial integration intentionally uses Google's official test ad units.
 * Replace with SKY SCOOTER's own AdMob units only after the AdMob app is created
 * and the app has been reviewed. Never use ARMASNAKE's production ad units here.
 */
class AdManager(private val context: Context) {
    private var rewardedAd: RewardedAd? = null
    private var interstitialAd: InterstitialAd? = null
    private var initialized = false

    fun initializeAfterConsent() {
        if (initialized) return
        initialized = true
        MobileAds.initialize(context) {
            loadRewarded()
            loadInterstitial()
        }
    }

    fun isRewardedLoaded(): Boolean = rewardedAd != null
    fun isInterstitialLoaded(): Boolean = interstitialAd != null

    fun showRewarded(activity: Activity, onRewardEarned: (RewardItem) -> Unit, onUnavailable: () -> Unit = {}) {
        if (!initialized) {
            onUnavailable()
            return
        }
        val ad = rewardedAd
        if (ad == null) {
            loadRewarded()
            onUnavailable()
            return
        }
        rewardedAd = null
        var earnedReward: RewardItem? = null
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                loadRewarded()
                earnedReward?.let(onRewardEarned)
            }
            override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                loadRewarded()
                onUnavailable()
            }
        }
        // Record the reward immediately, but only resume the game after the full-screen ad closes.
        ad.show(activity, OnUserEarnedRewardListener { reward -> earnedReward = reward })
    }

    fun showInterstitial(activity: Activity, onFinished: () -> Unit = {}) {
        if (!initialized) {
            onFinished()
            return
        }
        val ad = interstitialAd
        if (ad == null) {
            loadInterstitial()
            onFinished()
            return
        }
        interstitialAd = null
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                loadInterstitial()
                onFinished()
            }
            override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                loadInterstitial()
                onFinished()
            }
        }
        ad.show(activity)
    }

    private fun loadRewarded() {
        if (!initialized) return
        try {
            RewardedAd.load(context, rewardedAdUnitId(), AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) { rewardedAd = ad }
                    override fun onAdFailedToLoad(error: LoadAdError) { rewardedAd = null }
                })
        } catch (_: Exception) { rewardedAd = null }
    }

    private fun loadInterstitial() {
        if (!initialized) return
        try {
            InterstitialAd.load(context, interstitialAdUnitId(), AdRequest.Builder().build(),
                object : InterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: InterstitialAd) { interstitialAd = ad }
                    override fun onAdFailedToLoad(error: LoadAdError) { interstitialAd = null }
                })
        } catch (_: Exception) { interstitialAd = null }
    }

    private fun rewardedAdUnitId(): String =
        if (USE_TEST_ADS) TEST_REWARDED_AD_UNIT_ID else PROD_REWARDED_AD_UNIT_ID

    private fun interstitialAdUnitId(): String =
        if (USE_TEST_ADS) TEST_INTERSTITIAL_AD_UNIT_ID else PROD_INTERSTITIAL_AD_UNIT_ID

    companion object {
        // Keep test mode enabled until a real-device build has verified both ad flows.
        private const val USE_TEST_ADS = true

        // Official Google demo IDs: safe for development.
        private const val TEST_REWARDED_AD_UNIT_ID = "ca-app-pub-3940256099942544/5224354917"
        private const val TEST_INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-3940256099942544/1033173712"

        // SKY SCOOTER production units created in AdMob. Do not enable until testing is complete.
        private const val PROD_REWARDED_AD_UNIT_ID = "ca-app-pub-3521560929268417/3871153080"
        private const val PROD_INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-3521560929268417/9134380216"
    }
}
