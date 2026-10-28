package com.example.ads

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
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
    private var initializationStarted = false
    private var initialized = false
    private var rewardedLoading = false
    private var interstitialLoading = false
    private var lastInterstitialError: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pendingInterstitialActivity: Activity? = null
    private var pendingInterstitialCallback: (() -> Unit)? = null
    private var pendingInterstitialTimeout: Runnable? = null
    private val rewardedRetry = Runnable { loadRewarded() }
    private val interstitialRetry = Runnable { loadInterstitial() }

    fun initializeAfterConsent() {
        if (initializationStarted || initialized) return
        initializationStarted = true
        Log.d(TAG, "Mobile Ads initialization started; test mode=" + USE_TEST_ADS)
        MobileAds.initialize(context) { status ->
            mainHandler.post {
                initialized = true
                Log.d(TAG, "Mobile Ads initialized; adapters=" + status.adapterStatusMap)
                loadRewarded()
                loadInterstitial()
            }
        }
    }

    fun isRewardedLoaded(): Boolean = rewardedAd != null
    fun isInterstitialLoaded(): Boolean = interstitialAd != null
    fun interstitialStatus(): String = when {
        !initialized -> "NOT_INITIALIZED"
        interstitialAd != null -> "READY"
        interstitialLoading -> "LOADING"
        lastInterstitialError != null -> "FAILED: " + lastInterstitialError
        else -> "IDLE"
    }

    fun showRewarded(
        activity: Activity,
        onRewardEarned: (RewardItem) -> Unit,
        onUnavailable: () -> Unit = {},
        onNotEarned: () -> Unit = {}
    ) {
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
                val reward = earnedReward
                if (reward != null) onRewardEarned(reward) else onNotEarned()
            }
            override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                loadRewarded()
                onUnavailable()
            }
        }
        // Record the reward immediately, but only resume the game after the full-screen ad closes.
        ad.show(activity, OnUserEarnedRewardListener { reward -> earnedReward = reward })
    }

    fun showInterstitial(
        activity: Activity,
        maxWaitMs: Long = 3_000L,
        onFinished: () -> Unit = {}
    ) {
        mainHandler.post {
            if (!initialized) {
                Log.w(TAG, "Interstitial unavailable: SDK not initialized")
                onFinished()
                return@post
            }

            val readyAd = interstitialAd
            if (readyAd != null) {
                showLoadedInterstitial(activity, readyAd, onFinished)
                return@post
            }

            if (pendingInterstitialCallback != null) {
                Log.d(TAG, "Interstitial show already waiting")
                return@post
            }

            pendingInterstitialActivity = activity
            pendingInterstitialCallback = onFinished

            val timeout = Runnable {
                val callback = pendingInterstitialCallback
                pendingInterstitialActivity = null
                pendingInterstitialCallback = null
                pendingInterstitialTimeout = null
                Log.w(TAG, "Interstitial wait timeout; status=" + interstitialStatus())
                callback?.invoke()
            }
            pendingInterstitialTimeout = timeout
            mainHandler.postDelayed(timeout, maxWaitMs.coerceIn(500L, 5_000L))

            loadInterstitial()
        }
    }

    private fun showLoadedInterstitial(
        activity: Activity,
        ad: InterstitialAd,
        onFinished: () -> Unit
    ) {
        interstitialAd = null
        lastInterstitialError = null
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                Log.d(TAG, "Interstitial dismissed")
                loadInterstitial()
                onFinished()
            }

            override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                lastInterstitialError = adError.message
                Log.w(TAG, "Interstitial failed to show: " + adError.message)
                loadInterstitial()
                onFinished()
            }
        }
        Log.d(TAG, "Showing interstitial")
        ad.show(activity)
    }

    private fun loadRewarded() {
        if (!initialized || rewardedLoading || rewardedAd != null) return
        mainHandler.removeCallbacks(rewardedRetry)
        rewardedLoading = true
        val unitId = rewardedAdUnitId()
        Log.d(TAG, "Loading rewarded unit=" + unitId + " testMode=" + USE_TEST_ADS)
        try {
            RewardedAd.load(context, unitId, AdRequest.Builder().build(),
                object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(ad: RewardedAd) {
                        rewardedLoading = false
                        rewardedAd = ad
                        Log.d(TAG, "Rewarded loaded")
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        rewardedLoading = false
                        rewardedAd = null
                        Log.w(
                            TAG,
                            "Rewarded failed to load FULL=" + error +
                                " | code=" + error.code +
                                " | domain=" + error.domain +
                                " | message=" + error.message +
                                " | cause=" + error.cause +
                                " | responseInfo=" + error.responseInfo
                        )
                        scheduleRewardedRetry()
                    }
                })
        } catch (t: Throwable) {
            rewardedLoading = false
            rewardedAd = null
            Log.w(TAG, "Rewarded load exception", t)
            scheduleRewardedRetry()
        }
    }

    private fun loadInterstitial() {
        if (!initialized || interstitialLoading || interstitialAd != null) return
        mainHandler.removeCallbacks(interstitialRetry)
        interstitialLoading = true
        lastInterstitialError = null
        val unitId = interstitialAdUnitId()
        Log.d(TAG, "Loading interstitial unit=" + unitId + " testMode=" + USE_TEST_ADS)

        try {
            InterstitialAd.load(context, unitId, AdRequest.Builder().build(),
                object : InterstitialAdLoadCallback() {
                    override fun onAdLoaded(ad: InterstitialAd) {
                        interstitialLoading = false
                        interstitialAd = ad
                        lastInterstitialError = null
                        Log.d(TAG, "Interstitial loaded")

                        val activity = pendingInterstitialActivity
                        val callback = pendingInterstitialCallback
                        if (activity != null && callback != null &&
                            !activity.isFinishing && !activity.isDestroyed) {
                            pendingInterstitialTimeout?.let { mainHandler.removeCallbacks(it) }
                            pendingInterstitialActivity = null
                            pendingInterstitialCallback = null
                            pendingInterstitialTimeout = null
                            showLoadedInterstitial(activity, ad, callback)
                        }
                    }

                    override fun onAdFailedToLoad(error: LoadAdError) {
                        interstitialLoading = false
                        interstitialAd = null
                        lastInterstitialError = error.code.toString() + ": " + error.message
                        Log.w(
                            TAG,
                            "Interstitial failed to load FULL=" + error +
                                " | code=" + error.code +
                                " | domain=" + error.domain +
                                " | message=" + error.message +
                                " | cause=" + error.cause +
                                " | responseInfo=" + error.responseInfo
                        )
                        scheduleInterstitialRetry(
                            if (pendingInterstitialCallback != null) PENDING_RETRY_DELAY_MS
                            else RETRY_DELAY_MS
                        )
                    }
                })
        } catch (t: Throwable) {
            interstitialLoading = false
            interstitialAd = null
            lastInterstitialError = t.message ?: t.javaClass.simpleName
            Log.w(TAG, "Interstitial load exception", t)
            scheduleInterstitialRetry(RETRY_DELAY_MS)
        }
    }

    private fun scheduleRewardedRetry() {
        mainHandler.removeCallbacks(rewardedRetry)
        mainHandler.postDelayed(rewardedRetry, RETRY_DELAY_MS)
    }

    private fun scheduleInterstitialRetry(delayMs: Long) {
        mainHandler.removeCallbacks(interstitialRetry)
        mainHandler.postDelayed(interstitialRetry, delayMs)
    }

    private fun rewardedAdUnitId(): String =
        if (USE_TEST_ADS) TEST_REWARDED_AD_UNIT_ID else PROD_REWARDED_AD_UNIT_ID

    private fun interstitialAdUnitId(): String =
        if (USE_TEST_ADS) TEST_INTERSTITIAL_AD_UNIT_ID else PROD_INTERSTITIAL_AD_UNIT_ID

    companion object {
        private const val TAG = "SkyScooterAds"
        private const val RETRY_DELAY_MS = 15_000L
        private const val PENDING_RETRY_DELAY_MS = 1_000L

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
