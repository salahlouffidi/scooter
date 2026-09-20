package com.example

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : ComponentActivity() {

    private var webView: WebView? = null

    class AndroidBridge(private val context: Context) {
        // Fixed local asset only; no caller-controlled paths or network access.
        @JavascriptInterface
        fun readVisualKit(): String = context.assets.open("game/models/louffi-world.glb").use {
            android.util.Base64.encodeToString(it.readBytes(), android.util.Base64.NO_WRAP)
        }

        @JavascriptInterface
        fun vibrate(milliseconds: Long) {
            val clampedMs = milliseconds.coerceIn(10L, 500L)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                    val vibrator = vibratorManager?.defaultVibrator
                    vibrator?.vibrate(VibrationEffect.createOneShot(clampedMs, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator?.vibrate(VibrationEffect.createOneShot(clampedMs, VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                        @Suppress("DEPRECATION")
                        vibrator?.vibrate(clampedMs)
                    }
                }
            } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun onGameStateChanged(state: String) {
            // Lifecycle synchronization
        }

        @JavascriptInterface
        fun getAppVersion(): String = "1.0.0-louffi"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Immersive sticky full screen for arcade game
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

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
                        setLayerType(View.LAYER_TYPE_HARDWARE, null)
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
                        }
                        webChromeClient = WebChromeClient()
                        webViewClient = object : WebViewClient() {}
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

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        webView?.evaluateJavascript("window.gameInstance && window.gameInstance.resume && window.gameInstance.resume();", null)
    }

    override fun onPause() {
        webView?.evaluateJavascript("window.gameInstance && window.gameInstance.pause && window.gameInstance.pause();", null)
        webView?.onPause()
        super.onPause()
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

