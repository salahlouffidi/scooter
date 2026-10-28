plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.roborazzi)
}

// AdMob identifiers are public configuration, never account credentials.
fun adSetting(name: String) = providers.gradleProperty(name)
  .orElse(providers.environmentVariable(name)).orElse("").get()
val scooterAppId = adSetting("SCOOTER_ADMOB_APP_ID")
val scooterRewardedId = adSetting("SCOOTER_ADMOB_REWARDED_ID")
val scooterInterstitialId = adSetting("SCOOTER_ADMOB_INTERSTITIAL_ID")
val testAppId = scooterAppId.takeIf { Regex("ca-app-pub-[0-9]{16}~[0-9]{10}").matches(it) }
  ?: "ca-app-pub-3940256099942544~3347511713"

android {
  namespace = "com.example"
  compileSdk { version = release(36) { minorApiLevel = 1 } }

  defaultConfig {
    applicationId = "com.aistudio.skyscooter.louffi"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "1.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  signingConfigs {
    create("release") {
      val keystorePath = System.getenv("KEYSTORE_PATH") ?: "${rootDir}/my-upload-key.jks"
      storeFile = file(keystorePath)
      storePassword = System.getenv("STORE_PASSWORD")
      keyAlias = "upload"
      keyPassword = System.getenv("KEY_PASSWORD")
    }

  }

  buildTypes {
    release {
      isCrunchPngs = false
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      signingConfig = signingConfigs.getByName("release")
      manifestPlaceholders["admobAppId"] = scooterAppId
      buildConfigField("String", "ADMOB_REWARDED_ID", "\"$scooterRewardedId\"")
      buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"$scooterInterstitialId\"")
      buildConfigField("boolean", "ADS_TEST_MODE", "false")
    }
    debug {
      // Use Android's generated debug signing key; no key is committed to this repository.
      manifestPlaceholders["admobAppId"] = testAppId
      buildConfigField("String", "ADMOB_REWARDED_ID", "\"ca-app-pub-3940256099942544/5224354917\"")
      buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"ca-app-pub-3940256099942544/1033173712\"")
      buildConfigField("boolean", "ADS_TEST_MODE", "true")
    }
    create("adQa") {
      initWith(getByName("release"))
      applicationIdSuffix = ".adqa"
      signingConfig = signingConfigs.getByName("debug")
      matchingFallbacks += listOf("release")
      manifestPlaceholders["admobAppId"] = testAppId
      buildConfigField("String", "ADMOB_REWARDED_ID", "\"ca-app-pub-3940256099942544/5224354917\"")
      buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"ca-app-pub-3940256099942544/1033173712\"")
      buildConfigField("boolean", "ADS_TEST_MODE", "true")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions { unitTests { isIncludeAndroidResources = true } }
  dependenciesInfo {
    includeInApk = false
    includeInBundle = true
  }
}

dependencies {
  constraints {
    implementation("androidx.fragment:fragment:1.9.1") {
      because("Do not package the obsolete transitive Fragment 1.1.0 SDK")
    }
  }
  implementation(platform(libs.androidx.compose.bom))
  // Google Mobile Ads + User Messaging Platform (UMP) consent SDK.
  implementation("com.google.android.gms:play-services-ads:25.5.0")
  implementation("com.google.android.ump:user-messaging-platform:4.0.0")
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.graphics)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)

  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.core)
  testImplementation(libs.androidx.compose.ui.test.junit4)
  testImplementation(libs.androidx.core)
  testImplementation(libs.androidx.junit)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
  testImplementation(libs.roborazzi)
  testImplementation(libs.roborazzi.compose)
  testImplementation(libs.roborazzi.junit.rule)
  androidTestImplementation(platform(libs.androidx.compose.bom))
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.espresso.core)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.runner)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  debugImplementation(libs.androidx.compose.ui.tooling)
}


// A store release must never silently fall back to another app's or demo identifiers.
val validateReleaseAds by tasks.registering {
  doLast {
    val ids = listOf(scooterAppId to "~", scooterRewardedId to "/", scooterInterstitialId to "/")
    ids.forEach { (id, separator) ->
      require(Regex("ca-app-pub-[0-9]{16}" + Regex.escape(separator) + "[0-9]{10}").matches(id) &&
        !id.startsWith("ca-app-pub-3940256099942544")) {
        "Configure Scooter's SCOOTER_ADMOB_APP_ID, SCOOTER_ADMOB_REWARDED_ID and SCOOTER_ADMOB_INTERSTITIAL_ID. Use adQa for test ads."
      }
    }
  }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(validateReleaseAds) }
