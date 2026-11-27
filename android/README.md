# linktive 안드로이드 앱

안드로이드 클라이언트는 linktive 서버와 같은 저장소의 `android/`에서 관리합니다. 앱과 서버의 버전은 각각 정합니다.

## 연결 및 사용

1. linktive 웹의 **설정 → 계정 · API**에서 기기용 API 키를 발급합니다.
2. 앱에서 서버 주소와 키를 입력하고 **연결 확인 및 저장**을 누릅니다. 웹의 기본 소속에 북마크를 추가할 권한이 있으면 그 소속을 기본으로 선택합니다. 앱의 **설정 → 공유 저장 기본 소속**에서 바꿀 수 있습니다.
3. Chrome이나 YouTube에서 **공유 → linktive**를 선택하면 링크를 기기에 바로 저장합니다. WorkManager가 서버에 연결되는 대로 기본 소속에 올립니다. 앱에서 **저장 대기** 목록과 **지금 동기화** 버튼을 확인할 수 있습니다.

서버가 끊겨도 기기에 동기화된 목록과 태그를 볼 수 있습니다. 전송 대기 항목은 네트워크가 끊기거나 앱을 다시 열어도 보존됩니다. 서버에서 소속이 사라졌거나 쓰기 권한이 변경되면 대기 목록에서 다른 소속으로 옮길 수 있습니다.

자동 동기화 테스트에는 `Idempotency-Key`를 지원하는 linktive 서버를 사용하세요. 배포 빌드는 HTTPS 주소를 사용합니다. 디버그 빌드는 사설 주소와 Tailscale IP에서 HTTP 연결도 지원합니다. 예를 들어 개발 서버에는 `http://192.168.1.100:18080`처럼 자신의 내부망 주소와 포트를 입력하세요.

## 빌드

JDK 17, Android SDK 플랫폼 36 및 Build Tools 35.0.0이 필요합니다. Android Studio에서 `android/` 폴더를 열고 SDK Manager에서 두 SDK 구성 요소를 설치하세요. 터미널에서 직접 빌드하려면 `JAVA_HOME`에 JDK 17 경로, `ANDROID_HOME`에 Android SDK 경로를 지정하세요.

저장소 루트에서 Windows PowerShell로 빌드하는 명령입니다.

```powershell
cd .\android
.\gradlew.bat :app:assembleDebug
```

Linux에서는 저장소 루트에서 아래 명령을 실행합니다.

```sh
cd android
./gradlew :app:assembleDebug
```

빌드 결과는 저장소의 `android/app/build/outputs/apk/debug/app-debug.apk`에 생성됩니다. 빌드와 함께 테스트를 실행하려면 `:app:testDebugUnitTest` 작업을 추가하세요.
