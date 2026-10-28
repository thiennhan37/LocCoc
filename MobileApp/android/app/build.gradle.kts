plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Supply the public Web OAuth ID for normal IDE/Flutter builds too. The Google
// SDK reads this resource when Dart does not pass an explicit serverClientId.
// Never package the backend .env itself as an asset.
val publicGoogleConfig = providers.fileContents(
    rootProject.layout.projectDirectory.file("../../.env")
).asText.orNull.orEmpty().lineSequence().mapNotNull { line ->
    val match = Regex("""^\s*(GOOGLE_SERVER_CLIENT_ID|GOOGLE_CLIENT_IDS)\s*=\s*(.*?)\s*$""")
        .matchEntire(line) ?: return@mapNotNull null
    match.groupValues[1] to match.groupValues[2].trim().trim('"', '\'')
}.toMap()
val googleServerClientId = providers.environmentVariable("GOOGLE_SERVER_CLIENT_ID")
    .orNull?.trim()?.takeIf { it.isNotEmpty() }
    ?: publicGoogleConfig["GOOGLE_SERVER_CLIENT_ID"]?.takeIf { it.isNotEmpty() }
    ?: publicGoogleConfig["GOOGLE_CLIENT_IDS"]?.split(',')
        ?.map { it.trim() }?.filter { it.isNotEmpty() }?.singleOrNull()

android {
    namespace = "com.example.mobile_app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    buildFeatures {
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.example.mobile_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        if (googleServerClientId != null) {
            require(googleServerClientId.matches(Regex("""[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com"""))) {
                "GOOGLE_SERVER_CLIENT_ID must be a Web application OAuth client ID."
            }
            resValue("string", "default_web_client_id", googleServerClientId)
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// A physical phone cannot use the emulator-only 10.0.2.2 host alias. Forward
// the local gateway for ordinary `flutter run` and IDE debug builds as well.
// This task has no outputs: rerun it after a USB reconnect, even on cached builds.
val debugAdbExecutable = androidComponents.sdkComponents.adb
val debugCommandProviders = providers
val configureDebugApiReverse = tasks.register("configureDebugApiReverse") {
    group = "development"
    description = "Forward the local API Gateway to connected Android debug devices"
    doLast {
        try {
            val adbPath = debugAdbExecutable.get().asFile.absolutePath
            val inventory = debugCommandProviders.exec {
                commandLine(adbPath, "devices")
                isIgnoreExitValue = true
            }
            if (inventory.result.get().exitValue != 0) {
                logger.warn("Cannot inspect Android devices; configure adb reverse tcp:8080 tcp:8080 manually.")
                return@doLast
            }
            inventory.standardOutput.asText.get().lineSequence()
                .map { it.trim().split(Regex("\\s+")) }
                .filter { it.size >= 2 && it[1] == "device" }
                .forEach { device ->
                    val forwarding = debugCommandProviders.exec {
                        commandLine(adbPath, "-s", device[0], "reverse", "tcp:8080", "tcp:8080")
                        isIgnoreExitValue = true
                    }
                    if (forwarding.result.get().exitValue != 0) {
                        logger.warn("Cannot forward local API to ${device[0]}; use an explicit API_BASE_URL.")
                    } else {
                        logger.lifecycle("Local API Gateway forwarded on port 8080 for ${device[0]}")
                    }
                }
        } catch (error: Exception) {
            logger.warn("Local API forwarding unavailable; configure adb reverse tcp:8080 tcp:8080 manually.")
        }
    }
}

tasks.matching { it.name == "preDebugBuild" }.configureEach {
    dependsOn(configureDebugApiReverse)
}
