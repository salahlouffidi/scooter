package com.example.ads

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.example.BuildConfig
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback

/** UI-thread owned. Consent changes invalidate cached ads and in-flight loads. */
class AdManager(
    context: Context,
    private val canRequestAds: () -> Boolean,
    private val onChanged: () -> Unit
) {
    private val context = context.applicationContext
    private val handler = Handler(Looper.getMainLooper())
    private var initialized = false
    private var initializing = false
    private var destroyed = false
    private var generation = 0
    private var rewarded: RewardedAd? = null
    private var interstitial: InterstitialAd? = null
    private var loadingReward = false
    private var loadingInterstitial = false
    private var rewardLoadedAt = 0L
    private var interstitialLoadedAt = 0L
    private var nextRewardLoad = 0L
    private var nextInterstitialLoad = 0L
    private var lastFullScreenAt = SystemClock.elapsedRealtime()
    private var breaks = 0
    var showing = false
        private set

    private fun permitted() = !destroyed && canRequestAds()
    fun rewardedReady() = permitted() && rewarded != null &&
        SystemClock.elapsedRealtime() - rewardLoadedAt < 55 * 60_000L

    fun refreshConsent() {
        generation++
        rewarded = null
        interstitial = null
        loadingReward = false
        loadingInterstitial = false
        nextRewardLoad = 0L
        nextInterstitialLoad = 0L
        onChanged()
        if (!permitted()) return
        if (initialized) preload()
        else if (!initializing) {
            initializing = true
            MobileAds.initialize(context) {
                handler.post {
                    initializing = false
                    initialized = true
                    if (permitted()) preload()
                }
            }
        }
    }

    fun preload() {
        if (!initialized || !permitted() || showing) return
        val now = SystemClock.elapsedRealtime()
        if (!rewardedReady()) rewarded = null
        if (now - interstitialLoadedAt >= 55 * 60_000L) interstitial = null
        val token = generation
        if (rewarded == null && !loadingReward && now >= nextRewardLoad) {
            loadingReward = true
            RewardedAd.load(context, BuildConfig.ADMOB_REWARDED_ID, AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) {
                        if (token != generation || !permitted()) return
                        loadingReward = false
                        rewarded = ad
                        rewardLoadedAt = SystemClock.elapsedRealtime()
                        onChanged()
                    }
                    override fun onAdFailedToLoad(error: LoadAdError) {
                        if (token != generation || destroyed) return
                        android.util.Log.w("ScooterAds", "Rewarded load failed: ${error.code} ${error.message}")
                        loadingReward = false
                        nextRewardLoad = SystemClock.elapsedRealtime() + 30_000L
                        onChanged()
                        handler.postDelayed({ preload() }, 30_000L)
                    }
                })
        }
        if (interstitial == null && !loadingInterstitial && now >= nextInterstitialLoad) {
            loadingInterstitial = true
            InterstitialAd.load(context, BuildConfig.ADMOB_INTERSTITIAL_ID, AdRequest.Builder().build(),
                object : InterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: InterstitialAd) {
                        if (token != generation || !permitted()) return
                        loadingInterstitial = false
                        interstitial = ad
                        interstitialLoadedAt = SystemClock.elapsedRealtime()
                    }
                    override fun onAdFailedToLoad(error: LoadAdError) {
                        if (token != generation || destroyed) return
                        android.util.Log.w("ScooterAds", "Interstitial load failed: ${error.code} ${error.message}")
                        loadingInterstitial = false
                        nextInterstitialLoad = SystemClock.elapsedRealtime() + 30_000L
                        handler.postDelayed({ preload() }, 30_000L)
                    }
                })
        }
    }

    fun showRewarded(activity: Activity, complete: (String, Boolean) -> Unit) {
        if (showing || activity.isFinishing || activity.isDestroyed || !rewardedReady()) {
            complete("unavailable", false)
            preload()
            return
        }
        val ad = rewarded ?: return
        rewarded = null
        showing = true
        onChanged()
        var earned = false
        var finished = false
        fun finish(status: String) {
            if (finished) return
            finished = true
            showing = false
            lastFullScreenAt = SystemClock.elapsedRealtime()
            complete(status, earned)
            preload()
            onChanged()
        }
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() = finish("closed")
            override fun onAdFailedToShowFullScreenContent(adError: AdError) = finish("failed")
        }
        try { ad.show(activity) { earned = true } }
        catch (_: RuntimeException) { finish("failed") }
    }

    /** Called only when leaving a result screen. Never waits for an ad to load. */
    fun showInterstitial(activity: Activity, complete: (String) -> Unit) {
        breaks++
        val now = SystemClock.elapsedRealtime()
        val ad = interstitial
        if (!permitted() || showing || activity.isFinishing || activity.isDestroyed || ad == null ||
            breaks < 2 || now - lastFullScreenAt < 120_000L ||
            now - interstitialLoadedAt >= 55 * 60_000L) {
            complete("skipped")
            preload()
            return
        }
        interstitial = null
        showing = true
        breaks = 0
        var finished = false
        fun finish(status: String) {
            if (finished) return
            finished = true
            showing = false
            lastFullScreenAt = SystemClock.elapsedRealtime()
            complete(status)
            preload()
        }
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() = finish("closed")
            override fun onAdFailedToShowFullScreenContent(adError: AdError) = finish("failed")
        }
        try { ad.show(activity) } catch (_: RuntimeException) { finish("failed") }
    }

    fun destroy() {
        destroyed = true
        generation++
        handler.removeCallbacksAndMessages(null)
        rewarded = null
        interstitial = null
    }
}
