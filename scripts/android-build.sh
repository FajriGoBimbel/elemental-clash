#!/usr/bin/env bash
# Membangun APK debug Android. Jalankan dari akar proyek:  bash scripts/android-build.sh
# Prasyarat yang sudah disiapkan: JDK 21 di ~/.local/opt dan Android command-line tools di ~/Android/Sdk.
# Skrip ini akan MENAMPILKAN lisensi Android SDK untuk Anda setujui sendiri (ketik y).
set -euo pipefail
export JAVA_HOME="${JAVA_HOME:-$(ls -d "$HOME"/.local/opt/jdk-21* | head -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
npm run build
npx cap sync android
(cd android && ./gradlew assembleDebug)
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
