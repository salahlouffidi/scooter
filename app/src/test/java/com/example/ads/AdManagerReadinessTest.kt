package com.example.ads

import android.app.Activity
import android.content.Context
import android.os.Bundle
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.OnPaidEventListener
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.ResponseInfo
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.OnAdMetadataChangedListener
import com.google.android.gms.ads.rewarded.RewardItem
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.ConscryptMode
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowLooper
import org.robolectric.android.controller.ActivityController
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
// Logic tests run on a supported app API without Robolectric API 35+ native runtime.
// The app still compiles/targets API 36.1/36; these tests do not request real ads.
@Config(sdk = [28])
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@ConscryptMode(ConscryptMode.Mode.OFF)
@org.robolectric.annotation.LooperMode(org.robolectric.annotation.LooperMode.Mode.PAUSED)
class AdManagerReadinessTest {
    private lateinit var manager: AdManager
    private lateinit var rewardedCallbacks: MutableList<RewardedAdLoadCallback>
    private lateinit var interstitialCallbacks: MutableList<InterstitialAdLoadCallback>
    private var permission = false

    @Before
    fun setUp() {
        rewardedCallbacks = mutableListOf()
        interstitialCallbacks = mutableListOf()
        permission = false
        manager = AdManager(
            context = appContext(),
            canRequestAds = { permission },
            rewardedLoader = { _, _, callback -> rewardedCallbacks += callback },
            interstitialLoader = { _, _, callback -> interstitialCallbacks += callback },
        )
    }

    @Test
    fun doesNotLoadBeforeConsentAndSdkReady() {
        manager.preload()
        assertEquals(0, rewardedCallbacks.size)
        assertEquals(0, interstitialCallbacks.size)

        manager.setSdkReady(true)
        assertEquals(0, rewardedCallbacks.size)
        assertEquals(0, interstitialCallbacks.size)

        permission = true
        manager.setConsentAllowed(true)
        assertEquals(1, rewardedCallbacks.size)
        assertEquals(1, interstitialCallbacks.size)
    }

    @Test
    fun repeatedPreloadIsSerializedPerFormat() {
        readyAndPreload()

        repeat(10) { manager.preload() }

        assertEquals(1, rewardedCallbacks.size)
        assertEquals(1, interstitialCallbacks.size)
    }

    @Test
    fun failedLoadsBackOffAndUnavailableTapCannotBypassPendingRetry() {
        readyAndPreload()
        val activity = activity()
        var unavailable = 0
        val error = loadError()

        rewardedCallbacks.single().onAdFailedToLoad(error)
        manager.showRewarded(activity, onRewardEarned = {}, onUnavailable = { unavailable++ })
        assertEquals(1, unavailable)
        assertEquals(1, rewardedCallbacks.size)

        idleFor(AdManager.BASE_RETRY_MS - 1)
        assertEquals(1, rewardedCallbacks.size)
        idleFor(1)
        assertEquals(2, rewardedCallbacks.size)

        val retryDelays = listOf(4_000L, 8_000L, 16_000L, 32_000L)
        retryDelays.forEachIndexed { index, delay ->
            rewardedCallbacks[index + 1].onAdFailedToLoad(error)
            idleFor(delay - 1)
            assertEquals(index + 2, rewardedCallbacks.size)
            idleFor(1)
            assertEquals(index + 3, rewardedCallbacks.size)
        }

        // Initial request plus exactly MAX_RETRIES automatic retry requests.
        rewardedCallbacks.last().onAdFailedToLoad(error)
        idleFor(32_000L)
        assertEquals(AdManager.MAX_RETRIES + 1, rewardedCallbacks.size)
        assertTrue(unavailable > 0)
    }

    @Test
    fun falsePermissionCancelsPendingRetry() {
        readyAndPreload()
        rewardedCallbacks.single().onAdFailedToLoad(loadError())

        permission = false
        manager.setConsentAllowed(false)
        idleFor(60_000L)

        assertEquals(1, rewardedCallbacks.size)

        permission = true
        manager.setConsentAllowed(true)
        assertEquals(2, rewardedCallbacks.size)
    }

    @Test
    fun permissionPredicateRecheckInvalidatesLoadsWhenItBecomesFalse() {
        readyAndPreload()
        assertEquals(1, rewardedCallbacks.size)
        assertEquals(1, interstitialCallbacks.size)

        permission = false
        manager.preload()
        assertEquals(1, rewardedCallbacks.size)
        assertEquals(1, interstitialCallbacks.size)

        permission = true
        manager.setConsentAllowed(true)
        assertEquals(1, rewardedCallbacks.size)
        assertEquals(1, interstitialCallbacks.size)
        rewardedCallbacks[0].onAdFailedToLoad(loadError())
        interstitialCallbacks[0].onAdFailedToLoad(loadError())
        assertEquals(2, rewardedCallbacks.size)
        assertEquals(2, interstitialCallbacks.size)
    }

    @Test
    fun privacyChangeInvalidatesInFlightAndNewPermissionCannotOverlapRequests() {
        readyAndPreload()
        assertEquals(1, rewardedCallbacks.size)
        assertEquals(1, interstitialCallbacks.size)

        manager.suspendForConsentChange()
        permission = true
        manager.setConsentAllowed(true)

        // The old SDK calls are uncancellable; the loading lock remains until they answer.
        assertEquals(1, rewardedCallbacks.size)
        assertEquals(1, interstitialCallbacks.size)

        rewardedCallbacks[0].onAdFailedToLoad(loadError())
        assertEquals(2, rewardedCallbacks.size)
        assertEquals(1, interstitialCallbacks.size)
        interstitialCallbacks[0].onAdFailedToLoad(loadError())
        assertEquals(2, interstitialCallbacks.size)
    }

    @Test
    fun staleOrDuplicateFailureCannotChangeNewerLoad() {
        readyAndPreload()
        val oldCallback = rewardedCallbacks[0]
        manager.suspendForConsentChange()
        permission = true
        manager.setConsentAllowed(true)
        assertEquals(1, rewardedCallbacks.size)

        // Completing the stale request releases the lock and starts the one current request.
        oldCallback.onAdFailedToLoad(loadError())
        assertEquals(2, rewardedCallbacks.size)

        // A duplicate callback from the stale request must not schedule a retry for request 2.
        oldCallback.onAdFailedToLoad(loadError())
        assertEquals(2, rewardedCallbacks.size)

        rewardedCallbacks[1].onAdFailedToLoad(loadError())
        idleFor(AdManager.BASE_RETRY_MS - 1)
        assertEquals(2, rewardedCallbacks.size)
        idleFor(1)
        assertEquals(3, rewardedCallbacks.size)
    }

    @Test
    fun destroyCancelsRetriesAndIgnoresLateCallbacks() {
        readyAndPreload()
        val callback = rewardedCallbacks.single()
        callback.onAdFailedToLoad(loadError())
        manager.destroy()

        idleFor(60_000L)
        assertEquals(1, rewardedCallbacks.size)

        callback.onAdFailedToLoad(loadError())
        assertEquals(1, rewardedCallbacks.size)
    }

    @Test
    fun unavailableFormatReturnsPromptlyAndDoesNotDeferDisplay() {
        val activity = activity()
        var interstitialFinished = 0

        manager.showInterstitial(activity) { interstitialFinished++ }
        assertEquals(1, interstitialFinished)
        assertEquals(0, interstitialCallbacks.size)

        // Readiness opens loading, but an unavailable display still completes now and never queues show.
        permission = true
        manager.setConsentAllowed(true)
        manager.setSdkReady(true)
        var secondFinished = 0
        manager.showInterstitial(activity) { secondFinished++ }
        assertEquals(1, secondFinished)
        assertEquals(1, interstitialCallbacks.size)
        idleFor(60_000L)
        assertEquals(1, secondFinished)
    }

    @Test
    fun rewardedRewardIsDeliveredOnlyAfterDismissalAndOnlyWhenEarned() {
        readyAndPreload()
        val first = FakeRewardedAd()
        rewardedCallbacks.single().onAdLoaded(first)
        var earned = 0
        var notEarned = 0
        val activity = activity()

        manager.showRewarded(
            activity = activity,
            onRewardEarned = { earned++ },
            onNotEarned = { notEarned++ },
        )
        first.earn()
        assertEquals(0, earned)
        assertEquals(0, notEarned)
        first.dismiss()
        assertEquals(1, earned)
        assertEquals(0, notEarned)

        val second = FakeRewardedAd()
        rewardedCallbacks[1].onAdLoaded(second)
        manager.showRewarded(
            activity = activity,
            onRewardEarned = { earned++ },
            onNotEarned = { notEarned++ },
        )
        second.dismiss()
        assertEquals(1, earned)
        assertEquals(1, notEarned)
    }

    private fun readyAndPreload() {
        permission = true
        manager.setConsentAllowed(true)
        manager.setSdkReady(true)
    }

    private fun appContext(): Context =
        androidx.test.core.app.ApplicationProvider.getApplicationContext()

    private fun activity(): Activity =
        activityController().setup().get()

    private fun activityController(): ActivityController<Activity> =
        Robolectric.buildActivity(Activity::class.java)

    private fun idleFor(millis: Long) {
        ShadowLooper.shadowMainLooper().idleFor(millis, TimeUnit.MILLISECONDS)
    }

    private fun loadError(): LoadAdError =
        LoadAdError(1, "test failure", "test", null, null)

    private class FakeRewardedAd : RewardedAd() {
        private var rewardListener: OnUserEarnedRewardListener? = null
        private var contentCallback: FullScreenContentCallback? = null

        override fun setServerSideVerificationOptions(options: ServerSideVerificationOptions?) = Unit
        override fun setOnAdMetadataChangedListener(listener: OnAdMetadataChangedListener?) = Unit
        override fun getOnAdMetadataChangedListener(): OnAdMetadataChangedListener? = null
        override fun getAdMetadata(): Bundle = Bundle()
        override fun show(activity: Activity, listener: OnUserEarnedRewardListener) {
            rewardListener = listener
        }
        override fun getRewardItem(): RewardItem = object : RewardItem {
            override fun getType(): String = "coins"
            override fun getAmount(): Int = 1
        }
        // SDK 25.4.0 has no public empty-response constructor. No binder/network is used.
        override fun getResponseInfo(): ResponseInfo = ResponseInfo::class.java.declaredConstructors
            .single().apply { isAccessible = true }.newInstance(null) as ResponseInfo
        override fun setOnPaidEventListener(listener: OnPaidEventListener?) = Unit
        override fun getOnPaidEventListener(): OnPaidEventListener? = null
        override fun setFullScreenContentCallback(callback: FullScreenContentCallback?) {
            contentCallback = callback
        }
        override fun getFullScreenContentCallback(): FullScreenContentCallback? = contentCallback
        override fun getAdUnitId(): String = "fake-rewarded"
        override fun setImmersiveMode(immersiveMode: Boolean) = Unit
        override fun getPlacementId(): Long = 0L
        override fun setPlacementId(placementId: Long) = Unit

        fun earn() {
            rewardListener?.onUserEarnedReward(object : RewardItem {
                override fun getType(): String = "coins"
                override fun getAmount(): Int = 1
            })
        }

        fun dismiss() {
            contentCallback?.onAdDismissedFullScreenContent()
        }
    }
}
