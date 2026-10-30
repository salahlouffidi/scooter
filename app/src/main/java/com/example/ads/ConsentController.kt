package com.example.ads

import android.app.Activity
import android.util.Log
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform

/** Use UMP's persisted decision, refreshed at each launch; never infer consent locally. */
class ConsentController(private val activity: Activity) {
    private val information = UserMessagingPlatform.getConsentInformation(activity)
    @Volatile private var formPending = false
    @Volatile private var permitted = false
    val canRequestAds: Boolean get() = permitted && !formPending

    fun gather(onChanged: () -> Unit) {
        formPending = true
        information.requestConsentInfoUpdate(
            activity, ConsentRequestParameters.Builder().build(),
            {
                if (activity.isFinishing || activity.isDestroyed) return@requestConsentInfoUpdate
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { error ->
                    permitted = information.canRequestAds()
                    permitted = information.canRequestAds()
                permitted = information.canRequestAds()
            formPending = false
                    if (error != null) Log.w("ScooterConsent", "Consent form: ${error.errorCode}")
                    if (!activity.isFinishing && !activity.isDestroyed) onChanged()
                }
            },
            { error ->
                formPending = false
                Log.w("ScooterConsent", "Consent update: ${error.errorCode}")
                // A previous valid UMP decision can still permit ads after an update error.
                if (!activity.isFinishing && !activity.isDestroyed) onChanged()
            }
        )
    }

    fun showPrivacyOptions(onChanged: () -> Unit) {
        if (formPending || activity.isFinishing || activity.isDestroyed) return
        if (information.privacyOptionsRequirementStatus !=
            ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
            android.app.AlertDialog.Builder(activity)
                .setMessage("No privacy choice form is currently required for this device. See the privacy policy for other controls.")
                .setPositiveButton("Close", null).show()
            onChanged()
            return
        }
        formPending = true
        UserMessagingPlatform.showPrivacyOptionsForm(activity) { error ->
            formPending = false
            if (error != null) Log.w("ScooterConsent", "Privacy options: ${error.errorCode}")
            if (!activity.isFinishing && !activity.isDestroyed) onChanged()
        }
    }
}
