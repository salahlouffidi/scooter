package com.example.ads

import android.os.SystemClock
import android.util.Log

/** Local logcat only. Never include consent strings, device IDs or saved/player data. */
internal object AdDiagnostics {
    private val startedAt = SystemClock.elapsedRealtime()
    private var sequence = 0L

    fun event(stage: String, details: String = "") {
        val id = ++sequence
        val prefix = "epochMs=${System.currentTimeMillis()} elapsedMs=${SystemClock.elapsedRealtime() - startedAt} event=$id stage=$stage"
        // SDK error/ResponseInfo JSON can exceed logcat's per-entry limit.
        val chunks = details.ifEmpty { "-" }.chunked(2800)
        chunks.forEachIndexed { index, chunk ->
            Log.i("SkyScooterAds", "$prefix part=${index + 1}/${chunks.size} $chunk")
        }
    }

    fun exception(stage: String, error: Exception) {
        // Exception messages can contain caller data; SDK AdError is logged separately in full.
        event(stage, "exception=${error.javaClass.name} stack=${error.stackTrace.joinToString("\n")}")
    }
}
