package com.example.ads

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.google.android.gms.ads.MobileAds

/** Main-thread entry point; retains application context, never an Activity. */
internal object MobileAdsInitializer {
    private var started = false
    private var completed = false
    private val listeners = linkedSetOf<(Boolean) -> Unit>()
    private val handler = Handler(Looper.getMainLooper())

    fun initialize(context: Context, onReady: (Boolean) -> Unit): () -> Unit {
        check(Looper.myLooper() == Looper.getMainLooper())
        if (completed) {
            AdDiagnostics.event("sdk.init.already_complete")
            onReady(true)
            return {}
        }
        listeners.add(onReady)
        if (!started) {
            started = true
            val start = SystemClock.elapsedRealtime()
            AdDiagnostics.event("sdk.init.start", "appId=ca-app-pub-3521560929268417~8016739665 sdk=${MobileAds.getVersion()}")
            try {
                MobileAds.initialize(context.applicationContext) { status ->
                    handler.post {
                        completed = true
                        AdDiagnostics.event("sdk.init.complete", "durationMs=${SystemClock.elapsedRealtime() - start} adapters=${status.adapterStatusMap.mapValues { (_, value) -> "state=${value.initializationState},latencyMs=${value.latency},description=${value.description}" }}")
                        val ready = listeners.toList()
                        listeners.clear()
                        ready.forEach { it(true) }
                    }
                }
            } catch (error: Exception) {
                started = false
                AdDiagnostics.exception("sdk.init.exception", error)
                val failed = listeners.toList()
                listeners.clear()
                failed.forEach { it(false) }
            }
        } else {
            AdDiagnostics.event("sdk.init.already_pending")
        }
        return { listeners.remove(onReady) }
    }
}
