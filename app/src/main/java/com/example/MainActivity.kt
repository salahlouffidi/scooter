package com.example

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.example.ads.AdManager
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform

class MainActivity : ComponentActivity() {

    companion object {
        init {
            MainApplication.configureGraphicsEnvironment()
        }
    }

    private var webView: WebView? = null
    private var appResumed = false
    private lateinit var adManager: AdManager
    private var isAdsInitialized = false
    private var isPrivacyFormShowing = false

    private fun initializeAdsIfNeeded() {
        if (isAdsInitialized) return
        try {
            val consentInfo = UserMessagingPlatform.getConsentInformation(this)
            if (consentInfo.canRequestAds()) {
                isAdsInitialized = true
                MobileAds.initialize(this) {
                    runOnUiThread {
                        adManager.preload()
                    }
                }
            }
        } catch (_: Throwable) {}
    }

    inner class AndroidBridge(private val context: Context) {
        private val saves = context.getSharedPreferences("louffi_active_run", Context.MODE_PRIVATE)
        private val activity: Activity? = context as? Activity

        @JavascriptInterface
        fun isRewardedAdReady(): Boolean =
            adManager.isRewardedLoaded()

        @JavascriptInterface
        fun showInterstitial() {
            val host = activity ?: return
            host.runOnUiThread {
                adManager.showInterstitial(host) {
                    webView?.evaluateJavascript(
                        "window.gameInstance?.onInterstitialClosed?.();",
                        null
                    )
                }
            }
        }

        @JavascriptInterface
        fun showRewardedRevive() {
            val host = activity ?: return
            host.runOnUiThread {
                adManager.showRewarded(
                    activity = host,
                    onRewardEarned = {
                        webView?.evaluateJavascript(
                            "window.gameInstance?.onRewardedReviveEarned?.();",
                            null
                        )
                    },
                    onUnavailable = {
                        webView?.evaluateJavascript(
                            "window.gameInstance?.onRewardedAdUnavailable?.();",
                            null
                        )
                    },
                    onNotEarned = {
                        webView?.evaluateJavascript(
                            "window.gameInstance?.onRewardedAdNotCompleted?.();",
                            null
                        )
                    }
                )
            }
        }

        @JavascriptInterface
        fun readRunSnapshot(): String = saves.getString("snapshot", "") ?: ""

        @JavascriptInterface
        fun writeRunSnapshot(snapshot: String): Boolean {
            if (snapshot.length > 2_000_000) return false
            return try {
                val parsed = org.json.JSONObject(snapshot)
                if (parsed.optInt("version") != 1) false
                else saves.edit().putString("snapshot", snapshot).commit()
            } catch (_: Exception) { false }
        }

        @JavascriptInterface
        fun clearRunSnapshot() { saves.edit().remove("snapshot").commit() }

        // Fixed local asset only; no caller-controlled paths or network access.
        @JavascriptInterface
        fun readVisualKit(): String = context.assets.open("game/models/louffi-world.glb").use {
            android.util.Base64.encodeToString(it.readBytes(), android.util.Base64.NO_WRAP)
        }

        private fun vibrator(): Vibrator? = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        } catch (_: Exception) { null }

        @JavascriptInterface
        fun vibrate(milliseconds: Long) {
            val ms = milliseconds.coerceIn(5L, 500L)
            val v = vibrator() ?: return
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val amplitude = if (v.hasAmplitudeControl()) (40 + ms * 3).toInt().coerceIn(40, 255)
                    else VibrationEffect.DEFAULT_AMPLITUDE
                    v.vibrate(VibrationEffect.createOneShot(ms, amplitude))
                } else {
                    @Suppress("DEPRECATION")
                    v.vibrate(ms)
                }
            } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun vibratePattern(json: String, strength: Double) {
            val v = vibrator() ?: return
            try {
                val arr = org.json.JSONArray(json)
                val n = arr.length().coerceIn(1, 16)
                val timings = LongArray(n) { arr.optLong(it, 0L).coerceIn(0L, 400L) }
                if (timings.sum() > 1200L) return
                val k = strength.coerceIn(0.4, 1.6)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val effect = if (v.hasAmplitudeControl()) {
                        val amps = IntArray(n) { i -> if (i % 2 == 0) 0 else (60 + timings[i] * 4 * k).toInt().coerceIn(30, 255) }
                        VibrationEffect.createWaveform(timings, amps, -1)
                    } else {
                        VibrationEffect.createWaveform(timings, -1)
                    }
                    v.vibrate(effect)
                } else {
                    @Suppress("DEPRECATION")
                    v.vibrate(timings, -1)
                }
            } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun onGameStateChanged(state: String) {
            val playing = state == "PLAYING" || state == "COUNTDOWN"
            val host = activity ?: return
            host.runOnUiThread {
                try {
                    if (playing) host.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    else host.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) host.window.setSustainedPerformanceMode(playing)
                } catch (_: Throwable) {}
            }
        }

        @JavascriptInterface
        fun openPrivacyPolicy() {
            val host = activity ?: return
            host.runOnUiThread {
                try {
                    val intent = android.content.Intent(
                        android.content.Intent.ACTION_VIEW,
                        android.net.Uri.parse("https://salahlouffidi.github.io/sky-scooter-privacy.html")
                    )
                    host.startActivity(intent)
                } catch (_: Throwable) {}
            }
        }

        @JavascriptInterface
        fun isPrivacyOptionsRequired(): Boolean {
            return try {
                val info = UserMessagingPlatform.getConsentInformation(context)
                info.privacyOptionsRequirementStatus == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
            } catch (_: Throwable) {
                false
            }
        }

        @JavascriptInterface
        fun showPrivacyOptions() {
            val host = activity ?: return
            host.runOnUiThread {
                if (isPrivacyFormShowing) return@runOnUiThread
                isPrivacyFormShowing = true

                // Suspend ad requests, invalidate cached and in-flight ads while form is open
                adManager.invalidateAds()

                try {
                    UserMessagingPlatform.showPrivacyOptionsForm(host) { _ ->
                        isPrivacyFormShowing = false
                        // Recheck UMP permission after dismissal
                        try {
                            val info = UserMessagingPlatform.getConsentInformation(host)
                            if (info.canRequestAds()) {
                                initializeAdsIfNeeded()
                            } else {
                                adManager.invalidateAds()
                            }
                        } catch (_: Throwable) {}
                    }
                } catch (_: Throwable) {
                    isPrivacyFormShowing = false
                }
            }
        }

        @JavascriptInterface
        fun getAppVersion(): String = "1.0.0-louffi"
    }

    private fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        adManager = AdManager(applicationContext)
        try {
            val consentInformation = UserMessagingPlatform.getConsentInformation(this)
            val params = ConsentRequestParameters.Builder().build()
            consentInformation.requestConsentInfoUpdate(
                this,
                params,
                {
                    UserMessagingPlatform.loadAndShowConsentFormIfRequired(
                        this
                    ) { _ ->
                        if (consentInformation.canRequestAds()) {
                            initializeAdsIfNeeded()
                        } else {
                            adManager.invalidateAds()
                        }
                    }
                },
                { _ ->
                    if (consentInformation.canRequestAds()) {
                        initializeAdsIfNeeded()
                    } else {
                        adManager.invalidateAds()
                    }
                }
            )
            if (consentInformation.canRequestAds()) {
                initializeAdsIfNeeded()
            }
        } catch (_: Throwable) {
            try {
                val consentInformation = UserMessagingPlatform.getConsentInformation(this)
                if (consentInformation.canRequestAds()) {
                    initializeAdsIfNeeded()
                }
            } catch (_: Throwable) {}
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView?.evaluateJavascript("""
                    (() => {
                      const g = window.gameInstance;
                      if (!g) return 'exit';
                      if (g.state === 'PLAYING' || g.state === 'COUNTDOWN') g.pause();
                      else if (g.state === 'PAUSED') g.showMainMenu();
                      else return 'exit';
                      return 'handled';
                    })()
                """.trimIndent()) { result ->
                    if (result == "\"exit\"") moveTaskToBack(true)
                }
            }
        })

        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        hideSystemBars()

        setContent {
            val bridge = remember { AndroidBridge(this) }
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        setBackgroundColor(Color.BLACK)
                        overScrollMode = View.OVER_SCROLL_NEVER
                        isVerticalScrollBarEnabled = false
                        isHorizontalScrollBarEnabled = false
                        isLongClickable = false
                        setOnLongClickListener { true }
                        isHapticFeedbackEnabled = false
                        addOnLayoutChangeListener { v, l, t, r, b, _, _, _, _ ->
                            ViewCompat.setSystemGestureExclusionRects(v, listOf(Rect(0, 0, r - l, b - t)))
                        }
                        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
                        settings.apply {
                            @SuppressLint("SetJavaScriptEnabled")
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            databaseEnabled = true
                            allowFileAccess = true
                            mediaPlaybackRequiresUserGesture = false
                            cacheMode = WebSettings.LOAD_DEFAULT
                            useWideViewPort = true
                            loadWithOverviewMode = true
                            textZoom = 100
                            setSupportZoom(false)
                            builtInZoomControls = false
                            displayZoomControls = false
                        }
                        webChromeClient = WebChromeClient()
                        webViewClient = object : WebViewClient() {
                            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                                view?.let { wv ->
                                    (wv.parent as? ViewGroup)?.removeView(wv)
                                    wv.destroy()
                                }
                                if (this@MainActivity.webView === view) {
                                    this@MainActivity.webView = null
                                }
                                recreate()
                                return true
                            }
                        }
                        addJavascriptInterface(bridge, "AndroidBridge")
                        loadUrl("file:///android_asset/game/index.html")
                        this@MainActivity.webView = this
                    }
                }
            )

            DisposableEffect(Unit) {
                onDispose {
                    webView?.destroy()
                    webView = null
                }
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        appResumed = true
        webView?.onResume()
        webView?.evaluateJavascript("window.gameInstance?.onAppForeground();", null)
    }

    override fun onPause() {
        appResumed = false
        val view = webView
        view?.evaluateJavascript("window.gameInstance?.onAppBackground();") {
            if (!appResumed && webView === view) view?.onPause()
        }
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onPause()
    }

    override fun onUserLeaveHint() {
        webView?.evaluateJavascript("window.gameInstance?.onAppBackground();", null)
        super.onUserLeaveHint()
    }

    override fun onDestroy() {
        adManager.invalidateAds()
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}
