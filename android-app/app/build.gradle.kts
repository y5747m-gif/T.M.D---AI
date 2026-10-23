plugins { id("com.android.application") }

val generatedAssistantAssets = layout.buildDirectory.dir("generated/tmdAssistantAssets")
val bundleAssistantAssets by tasks.registering(Copy::class) {
    // تضمين واجهة الفقاعة والشعار الجديد داخل APK لتعمل فوراً بشفافية كاملة.
    from(rootProject.projectDir.parentFile) {
        include("floating-assistant.css", "floating-assistant.js")
    }
    from(File(rootProject.projectDir.parentFile, "images")) {
        include("aura-bubble-logo.svg")
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
        versionCode = 4
        versionName = "2.0.0"
    }

    sourceSets {
        getByName("main").assets.srcDir(generatedAssistantAssets)
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // APK جاهز للتثبيت المباشر على الهاتف؛ استبدله بمفتاح خاص عند النشر في Google Play.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

tasks.named("preBuild").configure { dependsOn(bundleAssistantAssets) }
