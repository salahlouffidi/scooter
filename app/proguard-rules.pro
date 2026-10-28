# Keep only callable JS entry points; allow other classes to shrink and obfuscate.
-keepclassmembers,allowoptimization class com.example.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers,allowoptimization class com.example.ads.GameAdsBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,SourceFile,LineNumberTable
