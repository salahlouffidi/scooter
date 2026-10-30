package com.example.ads

import org.junit.Assert.*
import org.junit.Test

class AdConsentStateTest {
    @Test fun unknownOrDeniedConsentNeverStartsAds() {
        val state = AdConsentState()
        assertFalse(state.beginInitialization())
        state.updateConsent(false)
        assertFalse(state.beginInitialization())
        assertFalse(state.canRequestAds)
    }
    @Test fun repeatedConsentCallbacksOnlyStartOneInitialization() {
        val state = AdConsentState()
        state.updateConsent(true)
        assertTrue(state.beginInitialization())
        state.updateConsent(true)
        assertFalse(state.beginInitialization())
        assertFalse(state.canRequestAds)
        state.initializationComplete()
        assertTrue(state.canRequestAds)
        assertFalse(state.beginInitialization())
    }
    @Test fun revocationWhileSdkInitializesCannotEnableAds() {
        val state = AdConsentState()
        state.updateConsent(true)
        assertTrue(state.beginInitialization())
        state.pauseForConsent()
        state.initializationComplete()
        assertFalse(state.canRequestAds)
        state.updateConsent(false)
        assertFalse(state.canRequestAds)
        state.updateConsent(true)
        assertTrue(state.canRequestAds)
        assertFalse(state.beginInitialization())
    }
    @Test fun duplicatePrivacyRequestsCannotReopenOrUnblockTheForm() {
        val state = AdConsentState()
        state.updateConsent(true)
        assertTrue(state.beginInitialization())
        state.initializationComplete()
        assertTrue(state.pauseForConsent())
        assertFalse(state.pauseForConsent())
        assertFalse(state.canRequestAds)
        state.updateConsent(false)
        assertFalse(state.canRequestAds)
    }
    @Test fun destructionIgnoresLateCallbacks() {
        val state = AdConsentState()
        state.updateConsent(true)
        assertTrue(state.beginInitialization())
        state.destroy()
        state.initializationComplete()
        state.updateConsent(true)
        assertFalse(state.canRequestAds)
        assertFalse(state.beginInitialization())
    }
    @Test fun initializationFailureCanRetryOnlyWithPermission() {
        val state = AdConsentState()
        state.updateConsent(true)
        assertTrue(state.beginInitialization())
        state.initializationFailed()
        state.updateConsent(false)
        assertFalse(state.beginInitialization())
        state.updateConsent(true)
        assertTrue(state.beginInitialization())
    }
}
