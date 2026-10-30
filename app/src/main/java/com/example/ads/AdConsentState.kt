package com.example.ads

/** SDK-independent state shared with WebView readiness reads; mutations run on UI thread. */
internal class AdConsentState {
    @Volatile private var permitted = false
    @Volatile private var formOpen = true
    @Volatile private var ready = false
    @Volatile private var destroyed = false
    private var initializing = false

    val canRequestAds: Boolean get() = permitted && !formOpen && ready && !destroyed
    fun pauseForConsent(): Boolean {
        if (destroyed || formOpen) return false
        formOpen = true
        return true
    }
    fun updateConsent(allowed: Boolean) {
        permitted = allowed
        formOpen = false
    }
    fun beginInitialization(): Boolean {
        if (destroyed || formOpen || !permitted || ready || initializing) return false
        initializing = true
        return true
    }
    fun initializationComplete() {
        if (!destroyed) ready = true
        initializing = false
    }
    fun initializationFailed() { initializing = false }
    fun destroy() {
        destroyed = true
        permitted = false
    }
}
