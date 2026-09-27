plugins { id("com.android.application") }

val generatedAssistantAssets = layout.buildDirectory.dir("generated/tmdAssistantAssets")
val bundleAssistantAssets by tasks.registering(Copy::class) {
    // تضمين واجهة الفقاعة في APK حتى لا يعتمد شكلها ووضع Android على نشر موقع لاحق.
    from(rootProject.projectDir.parentFile) {
        include("floating-assistant.css", "floating-assistant.js")
    }
    from("src/main/android-web") { include("assistant.html") }
    into(generatedAssistantAssets)
}

android {
    namespace = "ai.tmd.assistant"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.tmd.assistant"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.1.0"
    }

    sourceSets {
        getByName("main").assets.srcDir(generatedAssistantAssets)
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // APK قابل للتثبيت للاختبار/التوزيع الداخلي؛ استخدم مفتاح إصدار خاصاً قبل النشر العام.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

tasks.named("preBuild").configure { dependsOn(bundleAssistantAssets) }
