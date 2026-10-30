# JavaScript calls these methods by their original names through AndroidBridge.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod
-keepattributes SourceFile,LineNumberTable
# Google Mobile Ads / UMP package their own consumer rules. Do not keep all packages:
# doing so would defeat shrinking/obfuscation and hide configuration problems.
