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
import com.example.ads.AdsConsentManager

class MainActivity : ComponentActivity() {

    companion object {
        init {
            MainApplication.configureGraphicsEnvironment()
        }
    }

    private var webView: WebView? = null
    private var appResumed = false
    private var adManager: AdManager? = null
    private var consentManager: AdsConsentManager? = null

    inner class AndroidBridge(private val context: Context) {
        private val saves = context.getSharedPreferences("louffi_active_run", Context.MODE_PRIVATE)
        private val activity: Activity? = context as? Activity

        @JavascriptInterface
        fun readRunSnapshot(): String = saves.getString("snapshot", "") ?: ""

        @JavascriptInterface
        fun writeRunSnapshot(snapshot: String): Boolean {
            if (snapshot.length > 2_000_000) return false
            return try {
                val parsed = org.json.JSONObject(snapshot)
                val version = parsed.optInt("version")
                if (version != 1 && version != 2) false
                else saves.edit().putString("snapshot", snapshot).commit()
            } catch (_: Exception) { false }
        }

        @JavascriptInterface
        fun clearRunSnapshot() { saves.edit().remove("snapshot").commit() }

        @JavascriptInterface
        fun isRewardedAdReady(): Boolean = adManager?.isRewardedLoaded() == true

        @JavascriptInterface
        fun interstitialAdStatus(): String =
            adManager?.interstitialStatus() ?: "NO_MANAGER"

        @JavascriptInterface
        fun showInterstitial() {
            val host = activity ?: return
            host.runOnUiThread {
                val manager = adManager
                if (manager == null) {
                    webView?.evaluateJavascript("window.gameInstance?.onInterstitialClosed?.();", null)
                    return@runOnUiThread
                }
                manager.showInterstitial(host) {
                    webView?.evaluateJavascript("window.gameInstance?.onInterstitialClosed?.();", null)
                }
            }
        }

        @JavascriptInterface
        fun showRewardedRevive() {
            val host = activity ?: return
            host.runOnUiThread {
                val manager = adManager
                if (manager == null) {
                    webView?.evaluateJavascript("window.gameInstance?.onRewardedAdUnavailable?.();", null)
                    return@runOnUiThread
                }
                manager.showRewarded(
                    activity = host,
                    onRewardEarned = {
                        webView?.evaluateJavascript("window.gameInstance?.onRewardedReviveEarned?.();", null)
                    },
                    onUnavailable = {
                        webView?.evaluateJavascript("window.gameInstance?.onRewardedAdUnavailable?.();", null)
                    },
                    onNotEarned = {
                        webView?.evaluateJavascript("window.gameInstance?.onRewardedAdNotCompleted?.();", null)
                    }
                )
            }
        }

        @JavascriptInterface
        fun privacyOptionsRequired(): Boolean =
            consentManager?.privacyOptionsRequired() == true

        @JavascriptInterface
        fun showPrivacyOptions() {
            val host = activity ?: return
            host.runOnUiThread {
                val manager = consentManager
                if (manager == null) {
                    webView?.evaluateJavascript("window.gameInstance?.onPrivacyOptionsClosed?.(false);", null)
                    return@runOnUiThread
                }
                manager.showPrivacyOptions { error ->
                    val ok = error == null
                    webView?.evaluateJavascript("window.gameInstance?.onPrivacyOptionsClosed?.($ok);", null)
                }
            }
        }

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
        fun getAppVersion(): String = "1.0.0-louffi"
    }

    private fun hideSystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        adManager = AdManager(applicationContext)
        consentManager = AdsConsentManager(this)

        // Debug APKs use Google's official TEST ad units, so initialize immediately
        // for deterministic developer testing (same practical preload behavior as ARMASNAKE).
        // Release builds remain fully gated by UMP consent.
        if (BuildConfig.DEBUG) {
            adManager?.initializeAfterConsent()
        }

        consentManager?.gatherConsent { canRequestAds, _ ->
            if (!isFinishing && !isDestroyed && canRequestAds) {
                adManager?.initializeAfterConsent()
            }
        }

        // For release builds, a valid consent state from a previous session can
        // preload immediately while this launch refreshes UMP.
        if (!BuildConfig.DEBUG && consentManager?.canRequestAds() == true) {
            adManager?.initializeAfterConsent()
        }
        enableEdgeToEdge()
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
        // Dialogs, the notification shade and the keyboard bring the bars back: hide them again.
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
        webView?.destroy()
        webView = null
        super.onDestroy()
    }
}

@androidx.compose.runtime.Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    androidx.compose.material3.Text(text = "Hello $name!", modifier = modifier)
}
