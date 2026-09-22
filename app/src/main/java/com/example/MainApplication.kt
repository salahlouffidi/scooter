package com.example

import android.app.Application
import android.system.Os

class MainApplication : Application() {

    companion object {
        init {
            configureGraphicsEnvironment()
        }

        fun configureGraphicsEnvironment() {
            try {
                Os.setenv("MESA_LOG_FILE", "/dev/null", true)
                Os.setenv("MESA_DEBUG", "silent", true)
                Os.setenv("EGL_LOG_LEVEL", "fatal", true)
                Os.setenv("MESA_LOG_LEVEL", "fatal", true)
            } catch (_: Throwable) {
                // Ignore environment configuration failures on restricted platforms
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        configureGraphicsEnvironment()
    }
}
