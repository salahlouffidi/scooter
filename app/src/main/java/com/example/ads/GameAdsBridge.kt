package com.example.ads

import android.webkit.JavascriptInterface

/** Only attached to the bundled game. SDK work is dispatched to the UI thread. */
class GameAdsBridge(private val dispatch: (String, String) -> Unit) {
    @JavascriptInterface fun requestStatus() = dispatch("status", "")
    @JavascriptInterface fun showRewarded(requestId: String) = dispatch("rewarded", requestId)
    @JavascriptInterface fun showInterstitial(requestId: String) = dispatch("interstitial", requestId)
    @JavascriptInterface fun showPrivacyOptions(requestId: String) = dispatch("privacy", requestId)
}
