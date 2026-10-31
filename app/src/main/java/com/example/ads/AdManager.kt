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
import com.google.android.ump.UserMessagingPlatform

/**
 * Robust Google Mobile Ads integration for SKY SCOOTER — LOUFFI EDITION.
 *
 * Features:
 * - Strict UMP canRequestAds() gating for all loads and shows.
 * - Single initialization & session-based stale callback discarding.
 * - Invalidation when privacy options form is open.
 * - Production ad unit IDs.
 */
class AdManager(private val context: Context) {

    private var rewardedAd: RewardedAd? = null
    private var interstitialAd: InterstitialAd? = null
    private var isLoadingRewarded = false
    private var isLoadingInterstitial = false
    private var loadSessionId = 0

    private val canRequestAds: Boolean
        get() = try {
            UserMessagingPlatform.getConsentInformation(context).canRequestAds()
        } catch (_: Throwable) {
            false
        }

    fun invalidateAds() {
        loadSessionId++
        rewardedAd = null
        interstitialAd = null
        isLoadingRewarded = false
        isLoadingInterstitial = false
        Log.d(TAG, "Ads invalidated due to consent/privacy update (session $loadSessionId)")
    }

    fun preload() {
        if (!canRequestAds) {
            Log.d(TAG, "preload skipped: UMP canRequestAds() is false")
            return
        }
        loadRewarded()
        loadInterstitial()
    }

    fun isRewardedLoaded(): Boolean = canRequestAds && rewardedAd != null
    fun isInterstitialLoaded(): Boolean = canRequestAds && interstitialAd != null

    fun showRewarded(
        activity: Activity,
        onRewardEarned: (RewardItem) -> Unit,
        onUnavailable: () -> Unit = {},
        onNotEarned: () -> Unit = {}
    ) {
        if (!canRequestAds) {
            Log.w(TAG, "showRewarded rejected: consent does not allow ad requests")
            loadRewarded()
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
        if (!canRequestAds) {
            Log.w(TAG, "showInterstitial rejected: consent does not allow ad requests")
            loadInterstitial()
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
        if (!canRequestAds || rewardedAd != null || isLoadingRewarded) return
        isLoadingRewarded = true
        val sessionAtStart = loadSessionId
        val unitId = PROD_REWARDED_AD_UNIT_ID
        Log.d(TAG, "Loading rewarded; production ad unit (session $sessionAtStart)")

        try {
            RewardedAd.load(
                context,
                unitId,
                AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) {
                        if (sessionAtStart != loadSessionId || !canRequestAds) {
                            Log.d(TAG, "Discarding stale rewarded load callback")
                            isLoadingRewarded = false
                            return
                        }
                        isLoadingRewarded = false
                        rewardedAd = ad
                        Log.d(TAG, "Rewarded loaded successfully")
                    }

                    override fun onAdFailedToLoad(adError: LoadAdError) {
                        if (sessionAtStart != loadSessionId) {
                            isLoadingRewarded = false
                            return
                        }
                        isLoadingRewarded = false
                        rewardedAd = null
                        Log.w(TAG, "Rewarded failed to load: ${adError.code} ${adError.message}")
                    }
                }
            )
        } catch (t: Throwable) {
            isLoadingRewarded = false
            rewardedAd = null
            Log.w(TAG, "Rewarded load exception", t)
        }
    }

    private fun loadInterstitial() {
        if (!canRequestAds || interstitialAd != null || isLoadingInterstitial) return
        isLoadingInterstitial = true
        val sessionAtStart = loadSessionId
        val unitId = PROD_INTERSTITIAL_AD_UNIT_ID
        Log.d(TAG, "Loading interstitial; production ad unit (session $sessionAtStart)")

        try {
            InterstitialAd.load(
                context,
                unitId,
                AdRequest.Builder().build(),
                object : InterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: InterstitialAd) {
                        if (sessionAtStart != loadSessionId || !canRequestAds) {
                            Log.d(TAG, "Discarding stale interstitial load callback")
                            isLoadingInterstitial = false
                            return
                        }
                        isLoadingInterstitial = false
                        interstitialAd = ad
                        Log.d(TAG, "Interstitial loaded successfully")
                    }

                    override fun onAdFailedToLoad(adError: LoadAdError) {
                        if (sessionAtStart != loadSessionId) {
                            isLoadingInterstitial = false
                            return
                        }
                        isLoadingInterstitial = false
                        interstitialAd = null
                        Log.w(TAG, "Interstitial failed to load: ${adError.code} ${adError.message}")
                    }
                }
            )
        } catch (t: Throwable) {
            isLoadingInterstitial = false
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
