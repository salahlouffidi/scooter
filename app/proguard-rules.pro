# Add project specific ProGuard rules here.

# Preserve JavaScript Interface and AndroidBridge methods called from WebView
-keepclassmembers class com.example.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.example.MainActivity$AndroidBridge { *; }

# Google Mobile Ads SDK & UMP
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.ads.**
-keep class com.google.android.ump.** { *; }
-dontwarn com.google.android.ump.**
-keep class com.google.android.gms.common.** { *; }
-dontwarn com.google.android.gms.common.**

# Serialization / Moshi / Retrofit / Room
-keep class com.squareup.moshi.** { *; }
-dontwarn com.squareup.moshi.**
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**
-keep class androidx.room.** { *; }
-dontwarn androidx.room.**

# Line numbers for debugging stack traces if needed
-keepattributes SourceFile,LineNumberTable
