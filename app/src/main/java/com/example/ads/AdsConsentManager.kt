package com.example.ads

import android.app.Activity
import android.content.Context
import com.google.android.ump.ConsentDebugSettings
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform

/**
 * Collects consent before the app requests ads. UMP decides whether a form is
 * required for the current user/region; do not infer consent from country alone.
 */
class AdsConsentManager(private val activity: Activity) {
    private val consentInformation: ConsentInformation =
        UserMessagingPlatform.getConsentInformation(activity)

    fun gatherConsent(onComplete: (canRequestAds: Boolean, errorMessage: String?) -> Unit) {
        val params = ConsentRequestParameters.Builder().build()
        consentInformation.requestConsentInfoUpdate(
            activity,
            params,
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { formError ->
                    onComplete(consentInformation.canRequestAds(), formError?.message)
                }
            },
            { requestError ->
                // UMP may permit ads based on a previous valid consent state; never assume
                // permission if UMP says ads cannot be requested.
                onComplete(consentInformation.canRequestAds(), requestError.message)
            }
        )
    }

    fun privacyOptionsRequired(): Boolean =
        consentInformation.privacyOptionsRequirementStatus ==
            ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED

    fun showPrivacyOptions(onComplete: (String?) -> Unit = {}) {
        UserMessagingPlatform.showPrivacyOptionsForm(activity) { formError ->
            onComplete(formError?.message)
        }
    }
}
