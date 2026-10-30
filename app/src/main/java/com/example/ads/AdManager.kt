package com.example.ads

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardItem

/** All mutations/SDK calls run on the main thread. Loads never trigger display. */
class AdManager internal constructor(
    private val context: Context,
    private val canRequestAds: () -> Boolean,
    private val rewardedLoader: (Context, String, RewardedAdLoadCallback) -> Unit = { ctx, id, callback ->
        RewardedAd.load(ctx, id, AdRequest.Builder().build(), callback)
    },
    private val interstitialLoader: (Context, String, InterstitialAdLoadCallback) -> Unit = { ctx, id, callback ->
        InterstitialAd.load(ctx, id, AdRequest.Builder().build(), callback)
    }
) {
    private class Slot<T>(val format: String, val unitId: String) {
        var ad: T? = null
        var loadedAt = 0L
        var loading = false
        var request = 0L
        var retries = 0
        var retry: Runnable? = null
    }

    private val rewarded = Slot<RewardedAd>("rewarded", PROD_REWARDED_AD_UNIT_ID)
    private val interstitial = Slot<InterstitialAd>("interstitial", PROD_INTERSTITIAL_AD_UNIT_ID)
    private val handler = Handler(Looper.getMainLooper())
    private var consentAllowed = false
    private var sdkReady = false
    private var destroyed = false
    private var generation = 0L
    private var requestSequence = 0L
    private var fullScreenShowing = false

    fun setSdkReady(ready: Boolean) {
        assertMainThread()
        sdkReady = ready
        AdDiagnostics.event("sdk.gate", "ready=$ready generation=$generation")
        preload()
    }

    fun setConsentAllowed(allowed: Boolean) {
        assertMainThread()
        if (destroyed) return
        if (!allowed && consentAllowed) invalidate("consent.disallowed")
        consentAllowed = allowed
        AdDiagnostics.event("ump.permission", "canRequestAds=$allowed generation=$generation")
        if (allowed) preload() else cancelRetries()
    }

    /** Call before privacy choices open, even if permission remains true after dismissal. */
    fun suspendForConsentChange() {
        assertMainThread()
        consentAllowed = false
        invalidate("privacy.change")
    }

    fun destroy() {
        assertMainThread()
        destroyed = true
        consentAllowed = false
        invalidate("activity.destroy")
    }

    private fun invalidate(reason: String) {
        generation++
        rewarded.ad = null
        interstitial.ad = null
        rewarded.retries = 0
        interstitial.retries = 0
        cancelRetries()
        // SDK loads cannot be cancelled. Keep loading=true until their callback to
        // avoid concurrent requests; their generation will discard the result.
        AdDiagnostics.event("ads.invalidate", "reason=$reason generation=$generation")
    }

    private fun cancelRetries() {
        listOf(rewarded, interstitial).forEach { slot ->
            slot.retry?.let { handler.removeCallbacks(it) }
            slot.retry = null
        }
    }

    private fun permitted(): Boolean {
        if (destroyed || !sdkReady || !consentAllowed) return false
        return try {
            if (canRequestAds()) true else {
                setConsentAllowed(false)
                false
            }
        } catch (error: Exception) {
            AdDiagnostics.exception("ump.permission.exception", error)
            setConsentAllowed(false)
            false
        }
    }

    fun preload() {
        assertMainThread()
        AdDiagnostics.event("preload", "sdkReady=$sdkReady consentAllowed=$consentAllowed destroyed=$destroyed generation=$generation")
        if (!permitted()) return
        loadRewarded()
        loadInterstitial()
    }

    private fun <T> available(slot: Slot<T>): T? {
        if (slot.ad != null && SystemClock.elapsedRealtime() - slot.loadedAt >= MAX_CACHE_AGE_MS) {
            slot.ad = null
            AdDiagnostics.event("cache.expired", "format=${slot.format} unitId=${slot.unitId}")
        }
        return slot.ad
    }

    fun showRewarded(
        activity: Activity,
        onRewardEarned: (RewardItem) -> Unit,
        onUnavailable: () -> Unit = {},
        onNotEarned: () -> Unit = {}
    ) {
        assertMainThread()
        val ad = if (permitted()) available(rewarded) else null
        AdDiagnostics.event("display.request", "format=rewarded unitId=${rewarded.unitId} available=${ad != null} busy=$fullScreenShowing")
        if (ad == null || fullScreenShowing || activity.isDestroyed || activity.isFinishing) {
            onUnavailable()
            loadRewarded()
            return
        }
        rewarded.ad = null
        fullScreenShowing = true
        val showGeneration = generation
        var earnedReward: RewardItem? = null
        var finished = false
        fun finish(unavailable: Boolean = false) {
            if (finished) return
            finished = true
            fullScreenShowing = false
            if (destroyed || showGeneration != generation) return
            if (unavailable) onUnavailable()
            else earnedReward?.let(onRewardEarned) ?: onNotEarned()
            loadRewarded()
        }
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdShowedFullScreenContent() {
                AdDiagnostics.event("display.shown", "format=rewarded unitId=${rewarded.unitId}")
            }
            override fun onAdDismissedFullScreenContent() {
                AdDiagnostics.event("display.dismissed", "format=rewarded rewardConfirmed=${earnedReward != null}")
                finish()
            }
            override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                AdDiagnostics.event("display.failed", "format=rewarded unitId=${rewarded.unitId} error=$adError responseInfo=${ad.responseInfo}")
                finish(unavailable = true)
            }
        }
        try {
            ad.show(activity) { reward ->
                if (!finished && !destroyed && showGeneration == generation) {
                    earnedReward = reward
                    AdDiagnostics.event("reward.earned", "format=rewarded unitId=${rewarded.unitId}")
                }
            }
        } catch (error: Exception) {
            AdDiagnostics.exception("display.exception.rewarded", error)
            finish(unavailable = true)
        }
    }

    fun showInterstitial(activity: Activity, onFinished: () -> Unit = {}) {
        assertMainThread()
        val ad = if (permitted()) available(interstitial) else null
        AdDiagnostics.event("display.request", "format=interstitial unitId=${interstitial.unitId} available=${ad != null} busy=$fullScreenShowing")
        if (ad == null || fullScreenShowing || activity.isDestroyed || activity.isFinishing) {
            onFinished() // No waiting, and no deferred display from a load callback.
            loadInterstitial()
            return
        }
        interstitial.ad = null
        fullScreenShowing = true
        val showGeneration = generation
        var finished = false
        fun finish() {
            if (finished) return
            finished = true
            fullScreenShowing = false
            if (destroyed || showGeneration != generation) return
            onFinished()
            loadInterstitial()
        }
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdShowedFullScreenContent() {
                AdDiagnostics.event("display.shown", "format=interstitial unitId=${interstitial.unitId}")
            }
            override fun onAdDismissedFullScreenContent() {
                AdDiagnostics.event("display.dismissed", "format=interstitial")
                finish()
            }
            override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                AdDiagnostics.event("display.failed", "format=interstitial unitId=${interstitial.unitId} error=$adError responseInfo=${ad.responseInfo}")
                finish()
            }
        }
        try {
            ad.show(activity)
        } catch (error: Exception) {
            AdDiagnostics.exception("display.exception.interstitial", error)
            finish()
        }
    }

    private fun <T> beginLoad(slot: Slot<T>): Pair<Long, Long>? {
        if (!permitted() || available(slot) != null || slot.loading || slot.retry != null) return null
        slot.loading = true
        val request = ++requestSequence
        slot.request = request
        AdDiagnostics.event("load.start", "format=${slot.format} unitId=${slot.unitId} request=$request generation=$generation retry=${slot.retries}")
        return generation to request
    }

    private fun <T> accept(slot: Slot<T>, loadGeneration: Long, request: Long): Boolean {
        if (!slot.loading || slot.request != request) {
            AdDiagnostics.event("load.duplicate_callback", "format=${slot.format} request=$request activeRequest=${slot.request}")
            return false
        }
        slot.loading = false
        if (destroyed || loadGeneration != generation || !permitted()) {
            AdDiagnostics.event("load.stale", "format=${slot.format} unitId=${slot.unitId} request=$request loadGeneration=$loadGeneration currentGeneration=$generation")
            if (!destroyed) preload()
            return false
        }
        return true
    }

    private fun <T> retry(slot: Slot<T>, load: () -> Unit) {
        if (!permitted() || slot.retry != null) return
        if (slot.retries >= MAX_RETRIES) {
            AdDiagnostics.event("retry.exhausted", "format=${slot.format} unitId=${slot.unitId} retries=${slot.retries}")
            return
        }
        val delay = (BASE_RETRY_MS * (1L shl slot.retries)).coerceAtMost(MAX_RETRY_MS)
        slot.retries++
        val retryGeneration = generation
        val task = Runnable {
            slot.retry = null
            if (retryGeneration == generation && permitted()) load()
        }
        slot.retry = task
        AdDiagnostics.event("retry.scheduled", "format=${slot.format} unitId=${slot.unitId} retry=${slot.retries}/$MAX_RETRIES delayMs=$delay generation=$generation")
        handler.postDelayed(task, delay)
    }

    private fun loadRewarded() {
        val (loadGeneration, request) = beginLoad(rewarded) ?: return
        val start = SystemClock.elapsedRealtime()
        try {
            rewardedLoader(context, rewarded.unitId, object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    AdDiagnostics.event("load.success", "format=rewarded unitId=${rewarded.unitId} request=$request durationMs=${SystemClock.elapsedRealtime() - start} responseInfo=${ad.responseInfo}")
                    if (!accept(rewarded, loadGeneration, request)) return
                    rewarded.ad = ad
                    rewarded.loadedAt = SystemClock.elapsedRealtime()
                    rewarded.retries = 0
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    AdDiagnostics.event("load.failed", "format=rewarded unitId=${rewarded.unitId} request=$request durationMs=${SystemClock.elapsedRealtime() - start} error=$error responseInfo=${error.responseInfo}")
                    if (accept(rewarded, loadGeneration, request)) retry(rewarded, ::loadRewarded)
                }
            })
        } catch (error: Exception) {
            AdDiagnostics.exception("load.exception.rewarded", error)
            if (accept(rewarded, loadGeneration, request)) retry(rewarded, ::loadRewarded)
        }
    }

    private fun loadInterstitial() {
        val (loadGeneration, request) = beginLoad(interstitial) ?: return
        val start = SystemClock.elapsedRealtime()
        try {
            interstitialLoader(context, interstitial.unitId, object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    AdDiagnostics.event("load.success", "format=interstitial unitId=${interstitial.unitId} request=$request durationMs=${SystemClock.elapsedRealtime() - start} responseInfo=${ad.responseInfo}")
                    if (!accept(interstitial, loadGeneration, request)) return
                    interstitial.ad = ad
                    interstitial.loadedAt = SystemClock.elapsedRealtime()
                    interstitial.retries = 0
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    AdDiagnostics.event("load.failed", "format=interstitial unitId=${interstitial.unitId} request=$request durationMs=${SystemClock.elapsedRealtime() - start} error=$error responseInfo=${error.responseInfo}")
                    if (accept(interstitial, loadGeneration, request)) retry(interstitial, ::loadInterstitial)
                }
            })
        } catch (error: Exception) {
            AdDiagnostics.exception("load.exception.interstitial", error)
            if (accept(interstitial, loadGeneration, request)) retry(interstitial, ::loadInterstitial)
        }
    }

    private fun assertMainThread() = check(Looper.myLooper() == Looper.getMainLooper())

    companion object {
        internal const val MAX_RETRIES = 5
        internal const val BASE_RETRY_MS = 2_000L
        internal const val MAX_RETRY_MS = 32_000L
        private const val MAX_CACHE_AGE_MS = 55 * 60 * 1_000L
        internal const val PROD_REWARDED_AD_UNIT_ID = "ca-app-pub-3521560929268417/3871153080"
        internal const val PROD_INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-3521560929268417/9134380216"
    }
}
