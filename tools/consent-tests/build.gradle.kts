plugins { kotlin("jvm") version "2.2.10" }
repositories { mavenCentral() }
dependencies { testImplementation("junit:junit:4.13.2") }
kotlin {
    jvmToolchain(21)
    sourceSets.named("main") {
        kotlin.setSrcDirs(listOf("../../app/src/main/java"))
        kotlin.include("com/example/ads/AdConsentState.kt")
    }
    sourceSets.named("test") {
        kotlin.setSrcDirs(listOf("../../app/src/test/java"))
        kotlin.include("com/example/ads/AdConsentStateTest.kt")
    }
}
tasks.test { useJUnit() }
