# Add project specific ProGuard rules here.

# Preserve JavaScript Interface and AndroidBridge methods called from WebView
-keepclassmembers class com.example.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.example.MainActivity$AndroidBridge { *; }

# Google Mobile Ads SDK & UMP
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }

# Line numbers for debugging stack traces if needed
-keepattributes SourceFile,LineNumberTable
