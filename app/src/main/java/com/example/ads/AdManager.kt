package com.example.ads

import android.app.Activity
import android.content.Context
import android.util.Log
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardItem

/**
 * Simple Google Mobile Ads integration for SKY SCOOTER — LOUFFI EDITION.
 *
 * Mirrors the ARMASNAKE preload/show pattern:
 * - preload one interstitial and one rewarded ad
 * - show with the active Activity
 * - preload the next ad after dismissal
 *
 * Uses SKY SCOOTER's production ad unit IDs for all build types.
 * During development, register devices as test devices in AdMob to avoid invalid traffic.
 */
class AdManager(
    private val context: Context,
    private val canRequestAds: () -> Boolean
) {
    private var generation = 0
    private var destroyed = false
    private var rewardedLoading = false
    private var interstitialLoading = false

    fun destroy() {
        destroyed = true
        clearCachedAds()
    }

    fun clearCachedAds() {
        generation++
        rewardedLoading = false
        interstitialLoading = false
        rewardedAd = null
        interstitialAd = null
    }

    @Volatile private var rewardedAd: RewardedAd? = null
    @Volatile private var interstitialAd: InterstitialAd? = null

    fun preload() {
        loadRewarded()
        loadInterstitial()
    }

    fun isRewardedLoaded(): Boolean = canRequestAds() && rewardedAd != null
    fun isInterstitialLoaded(): Boolean = canRequestAds() && interstitialAd != null

    fun showRewarded(
        activity: Activity,
        onRewardEarned: (RewardItem) -> Unit,
        onUnavailable: () -> Unit = {},
        onNotEarned: () -> Unit = {}
    ) {
        val ad = if (canRequestAds()) rewardedAd else null
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
                val reward = earnedReward
                if (reward != null) onRewardEarned(reward) else onNotEarned()
            }

            override fun onAdFailedToShowFullScreenContent(
                adError: com.google.android.gms.ads.AdError
            ) {
                Log.w(TAG, "Rewarded failed to show: ${adError.code} ${adError.message}")
                loadRewarded()
                onUnavailable()
            }
        }

        ad.show(activity, OnUserEarnedRewardListener { reward ->
            earnedReward = reward
        })
    }

    fun showInterstitial(
        activity: Activity,
        onFinished: () -> Unit = {}
    ) {
        val ad = if (canRequestAds()) interstitialAd else null
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

            override fun onAdFailedToShowFullScreenContent(
                adError: com.google.android.gms.ads.AdError
            ) {
                Log.w(TAG, "Interstitial failed to show: ${adError.code} ${adError.message}")
                loadInterstitial()
                onFinished()
            }
        }

        ad.show(activity)
    }

    private fun loadRewarded() {
        if (destroyed || !canRequestAds() || rewardedLoading || rewardedAd != null) return
        rewardedLoading = true
        val requestGeneration = generation
        val unitId = PROD_REWARDED_AD_UNIT_ID
        Log.d(TAG, "Loading rewarded; production ad unit")

        try {
            RewardedAd.load(
                context,
                unitId,
                AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) {
                        if (destroyed || requestGeneration != generation) return
                        rewardedLoading = false
                        rewardedAd = if (canRequestAds()) ad else null
                        Log.d(TAG, "Rewarded loaded")
                    }

                    override fun onAdFailedToLoad(adError: LoadAdError) {
                        if (destroyed || requestGeneration != generation) return
                        rewardedLoading = false
                        rewardedAd = null
                        Log.w(TAG, "Rewarded failed to load: ${adError.code} ${adError.message}")
                    }
                }
            )
        } catch (t: Throwable) {
            rewardedLoading = false
            rewardedAd = null
            Log.w(TAG, "Rewarded load exception", t)
        }
    }

    private fun loadInterstitial() {
        if (destroyed || !canRequestAds() || interstitialLoading || interstitialAd != null) return
        interstitialLoading = true
        val requestGeneration = generation
        val unitId = PROD_INTERSTITIAL_AD_UNIT_ID
        Log.d(TAG, "Loading interstitial; production ad unit")

        try {
            InterstitialAd.load(
                context,
                unitId,
                AdRequest.Builder().build(),
                object : InterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: InterstitialAd) {
                        if (destroyed || requestGeneration != generation) return
                        interstitialLoading = false
                        interstitialAd = if (canRequestAds()) ad else null
                        Log.d(TAG, "Interstitial loaded")
                    }

                    override fun onAdFailedToLoad(adError: LoadAdError) {
                        if (destroyed || requestGeneration != generation) return
                        interstitialLoading = false
                        interstitialAd = null
                        Log.w(TAG, "Interstitial failed to load: ${adError.code} ${adError.message}")
                    }
                }
            )
        } catch (t: Throwable) {
            interstitialLoading = false
            interstitialAd = null
            Log.w(TAG, "Interstitial load exception", t)
        }
    }

    companion object {
        private const val TAG = "SkyScooterAds"

        // SKY SCOOTER production units.
        private const val PROD_REWARDED_AD_UNIT_ID =
            "ca-app-pub-3521560929268417/3871153080"
        private const val PROD_INTERSTITIAL_AD_UNIT_ID =
            "ca-app-pub-3521560929268417/9134380216"


    }
}
