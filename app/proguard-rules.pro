# The WebView invokes annotated methods by name. Preserve these members under R8.
-keepclassmembers class com.example.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepattributes SourceFile,LineNumberTable
# Google Mobile Ads, UMP, Moshi, Retrofit and Room ship consumer rules.
# Avoid blanket -keep and -dontwarn rules that hide missing types and disable optimization.
