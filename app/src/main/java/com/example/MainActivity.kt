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
import com.example.ads.AdDiagnostics
import com.example.ads.AdManager
import com.example.ads.MobileAdsInitializer
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
    private var consentInformation: ConsentInformation? = null
    private var adsDestroyed = false
    private var sdkInitializationRequested = false
    private var cancelSdkListener: (() -> Unit)? = null
    private var privacyChoicesOpen = false
    @Volatile private var currentGameState = "BOOT"
    private var webDocumentGeneration = 0L

    private fun withCurrentAdRequest(format: String, requestId: Long, show: (WebView) -> Unit) {
        val view = webView ?: return
        val documentGeneration = webDocumentGeneration
        if (adsDestroyed || isFinishing || requestId <= 0) return
        view.evaluateJavascript("window.gameInstance?.isAdRequestCurrent?.('$format', $requestId) === true;") { result ->
            if (adsDestroyed || webView !== view || documentGeneration != webDocumentGeneration) return@evaluateJavascript
            if (result == "true" && currentGameState == "GAME_OVER" && appResumed && !isFinishing) {
                show(view)
            } else {
                AdDiagnostics.event("display.stale_or_background", "format=$format request=$requestId")
                val callback = if (format == "interstitial") "onInterstitialClosed" else "onRewardedAdUnavailable"
                view.evaluateJavascript("window.gameInstance?.$callback?.($requestId);", null)
            }
        }
    }

    // Outside Compose's generic remember scope so lint resolves the concrete interface.
    private fun installAndroidBridge(view: WebView, bridge: AndroidBridge) {
        view.addJavascriptInterface(bridge, "AndroidBridge")
    }

    inner class AndroidBridge(private val context: Context) {
        private val saves = context.getSharedPreferences("louffi_active_run", Context.MODE_PRIVATE)
        private val activity: Activity? = context as? Activity

        @JavascriptInterface
        fun showInterstitial(requestId: Long) {
            val host = activity ?: return
            host.runOnUiThread {
                withCurrentAdRequest("interstitial", requestId) { view ->
                    val documentGeneration = webDocumentGeneration
                    adManager.showInterstitial(host) {
                        if (!adsDestroyed && webView === view && documentGeneration == webDocumentGeneration) view.evaluateJavascript(
                            "window.gameInstance?.onInterstitialClosed?.($requestId);", null
                        )
                    }
                }
            }
        }

        @JavascriptInterface
        fun showRewardedRevive(requestId: Long) {
            val host = activity ?: return
            host.runOnUiThread {
                withCurrentAdRequest("rewarded", requestId) { view ->
                    val documentGeneration = webDocumentGeneration
                    fun callback(method: String) {
                        if (!adsDestroyed && webView === view && documentGeneration == webDocumentGeneration) view.evaluateJavascript(
                            "window.gameInstance?.$method?.($requestId);", null
                        )
                    }
                    adManager.showRewarded(
                        activity = host,
                        onRewardEarned = { callback("onRewardedReviveEarned") },
                        onUnavailable = { callback("onRewardedAdUnavailable") },
                        onNotEarned = { callback("onRewardedAdNotCompleted") }
                    )
                }
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

        // Single pulse. On devices with amplitude control, longer pulses are also stronger,
        // so a coin tick feels light and a crash feels heavy instead of just longer.
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

        // Pattern from JS: [pause, pulse, pause, pulse, ...] in milliseconds (max 16 entries).
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

        // Keep the screen awake and ask for sustained (thermally stable) performance only
        // while a run is in progress.
        @JavascriptInterface
        fun onGameStateChanged(state: String) {
            // Set before posting window work so a queued ad cannot overtake a new run.
            currentGameState = state
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
                if (adsDestroyed || privacyChoicesOpen) return@runOnUiThread
                privacyChoicesOpen = true
                adManager.suspendForConsentChange()
                AdDiagnostics.event("ump.privacy.start")
                try {
                    UserMessagingPlatform.showPrivacyOptionsForm(host) { error ->
                        if (adsDestroyed) return@showPrivacyOptionsForm
                        privacyChoicesOpen = false
                        AdDiagnostics.event("ump.privacy.complete", "errorCode=${error?.errorCode} message=${error?.message}")
                        refreshAdPermission("privacy.complete")
                    }
                } catch (error: Exception) {
                    privacyChoicesOpen = false
                    AdDiagnostics.exception("ump.privacy.exception", error)
                    refreshAdPermission("privacy.exception")
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

    private fun umpPermitsRequests(): Boolean = try {
        consentInformation?.canRequestAds() == true
    } catch (error: Exception) {
        AdDiagnostics.exception("ump.permission.exception", error)
        false
    }

    private fun refreshAdPermission(stage: String) {
        if (adsDestroyed) return
        val allowed = !privacyChoicesOpen && umpPermitsRequests()
        AdDiagnostics.event("ump.check", "source=$stage canRequestAds=$allowed privacyChoicesOpen=$privacyChoicesOpen")
        adManager.setConsentAllowed(allowed)
        if (allowed && !sdkInitializationRequested) {
            sdkInitializationRequested = true
            cancelSdkListener = MobileAdsInitializer.initialize(applicationContext) { ready ->
                if (adsDestroyed) return@initialize
                if (!ready) sdkInitializationRequested = false
                // Consent may have changed while initialization was in flight.
                adManager.setConsentAllowed(!privacyChoicesOpen && umpPermitsRequests())
                adManager.setSdkReady(ready)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        adManager = AdManager(applicationContext, canRequestAds = { !privacyChoicesOpen && umpPermitsRequests() })
        AdDiagnostics.event("activity.create")
        try {
            val info = UserMessagingPlatform.getConsentInformation(this)
            consentInformation = info
            val params = ConsentRequestParameters.Builder().build()
            AdDiagnostics.event("ump.update.start")
            info.requestConsentInfoUpdate(
                this,
                params,
                {
                    if (adsDestroyed) return@requestConsentInfoUpdate
                    AdDiagnostics.event("ump.update.success")
                    if (info.consentStatus == ConsentInformation.ConsentStatus.REQUIRED) {
                        privacyChoicesOpen = true
                        adManager.suspendForConsentChange()
                    }
                    refreshAdPermission("update.success")
                    AdDiagnostics.event("ump.form.start")
                    try {
                        UserMessagingPlatform.loadAndShowConsentFormIfRequired(this) { error ->
                            if (adsDestroyed) return@loadAndShowConsentFormIfRequired
                            privacyChoicesOpen = false
                            AdDiagnostics.event("ump.form.complete", "errorCode=${error?.errorCode} message=${error?.message}")
                            refreshAdPermission("form.complete")
                        }
                    } catch (error: Exception) {
                        privacyChoicesOpen = false
                        AdDiagnostics.exception("ump.form.exception", error)
                        refreshAdPermission("form.exception")
                    }
                },
                { error ->
                    if (adsDestroyed) return@requestConsentInfoUpdate
                    AdDiagnostics.event("ump.update.failed", "errorCode=${error.errorCode} message=${error.message}")
                    refreshAdPermission("update.failed")
                }
            )
            refreshAdPermission("update.requested.previous_session")
        } catch (error: Exception) {
            AdDiagnostics.exception("ump.update.exception", error)
            refreshAdPermission("update.exception") // Fail closed unless UMP explicitly permits requests.
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

        // Immersive sticky full screen for the arcade game; draw into the notch area too so the
        // game fills the whole display (the HUD respects env(safe-area-inset-*)).
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        hideSystemBars()

        setContent {
            val bridge: AndroidBridge = remember { AndroidBridge(this) }
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
                        // A game surface: no context menu and no system haptic echo on touch.
                        isLongClickable = false
                        setOnLongClickListener { true }
                        isHapticFeedbackEnabled = false
                        // Edge swipes next to the thumb-stick must not trigger system back gestures.
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
                            // Fixed UI scale: the system font-size setting must not reflow the HUD.
                            textZoom = 100
                            setSupportZoom(false)
                            builtInZoomControls = false
                            displayZoomControls = false
                        }
                        webChromeClient = WebChromeClient()
                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                                webDocumentGeneration++
                                currentGameState = "BOOT"
                                AdDiagnostics.event("webview.document.start", "generation=$webDocumentGeneration")
                            }

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
                        installAndroidBridge(this, bridge)
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
        // Dialogs, the notification shade and the keyboard bring the bars back: hide them again.
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        appResumed = true
        AdDiagnostics.event("activity.resume")
        if (::adManager.isInitialized) refreshAdPermission("activity.resume")
        webView?.onResume()
        webView?.evaluateJavascript("window.gameInstance?.onAppForeground();", null)
    }

    override fun onPause() {
        appResumed = false
        AdDiagnostics.event("activity.pause")
        val view = webView
        // Let JavaScript freeze and save before pausing the WebView itself.
        view?.evaluateJavascript("window.gameInstance?.onAppBackground();") {
            if (!appResumed && webView === view) view?.onPause()
        }
        // Never hold the screen awake or request sustained performance while backgrounded.
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onPause()
    }

    override fun onUserLeaveHint() {
        webView?.evaluateJavascript("window.gameInstance?.onAppBackground();", null)
        super.onUserLeaveHint()
    }

    override fun onDestroy() {
        adsDestroyed = true
        cancelSdkListener?.invoke()
        cancelSdkListener = null
        if (::adManager.isInitialized) adManager.destroy()
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}

@androidx.compose.runtime.Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    androidx.compose.material3.Text(text = "Hello $name!", modifier = modifier)
}
