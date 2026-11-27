# linktive 확장 프로그램 배포 매뉴얼

이미 게시된 [linktive](https://chromewebstore.google.com/detail/linktive/opalenmkjhflejpemlkbliiadchgjhje)는 개발자 대시보드의 기존 항목에서 업데이트합니다. 해당 항목을 관리할 수 있는 Google 계정으로 로그인하고 2단계 인증을 설정하세요. [Chrome 웹 스토어 업데이트 공식 가이드](https://developer.chrome.com/docs/webstore/update) · [개발자 계정 요건](https://developer.chrome.com/docs/webstore/using-api#prerequisites)

---

## 1. 버전 확인 및 빌드

`extension/public/manifest.json`의 `version`이 웹 스토어에 올린 이전 확장 버전보다 높아야 합니다. 버전을 올릴 때 `extension/package.json`과 `extension/package-lock.json`의 프로젝트 버전도 맞추세요. 서버 버전은 별도로 관리합니다.

저장소 루트에서 실행합니다.

```bash
cd extension
npm ci
npm run build
```

## 2. Chrome에서 테스트하고 ZIP 만들기

1. `chrome://extensions`에서 **개발자 모드 → 압축해제된 확장 프로그램을 로드합니다**를 선택하고 `extension/dist`를 엽니다.
2. Chrome 표시 언어를 한국어와 영어로 각각 설정한 뒤 Chrome을 다시 시작해 저장 팝업, 설정 화면, 주소창의 `lk` 검색 안내를 확인합니다. 지원하는 언어는 한국어와 영어이며, 다른 표시 언어에는 영어가 표시됩니다. [OS별 Chrome 표시 언어 테스트 방법](https://developer.chrome.com/docs/extensions/reference/api/i18n#how-to-set-browsers-locale)
3. 테스트용 linktive 서버와 API 키로 연결한 뒤 북마크 저장, **웹에서 확인**, 주소창 검색을 확인합니다. 저장한 북마크의 상세 화면을 열려면 서버와 확장 프로그램 모두 0.5.0 이상이 필요합니다.

빌드 명령을 실행한 `extension` 폴더에서 ZIP을 만듭니다. 아래 예시는 확장 버전 `0.5.0` 기준입니다. 다음 배포 때는 파일 이름의 버전을 바꾸세요.

```bash
(cd dist && zip -r ../linktive-extension-0.5.0.zip .)
```

Windows PowerShell에서는 같은 위치에서 실행합니다.

```powershell
Compress-Archive -Path 'dist\*' -DestinationPath 'linktive-extension-0.5.0.zip'
```

ZIP 최상위에 `manifest.json`, `background.js`, `popup.html`, `options.html`, `_locales/`, `icons/`, `assets/`가 있어야 합니다. [Google 패키징 안내](https://developer.chrome.com/docs/webstore/prepare#zip-your-extension-files)

## 3. 기존 항목 업데이트 및 심사 제출

1. [Chrome 웹 스토어 개발자 대시보드](https://chrome.google.com/webstore/devconsole)에 로그인합니다.
2. 기존 **linktive** 항목을 열고 **패키지(Package) → 새 패키지 업로드(Upload New Package)**에서 ZIP을 올립니다. 기존 확장 ID는 `opalenmkjhflejpemlkbliiadchgjhje`입니다.
3. 스토어 소개, 개인정보 공개 항목, 배포 정보가 바뀌었다면 해당 탭에서 수정합니다. 영어 스토어 설명을 추가하려면 **스토어 등록정보(Store Listing)**의 언어 목록에서 영어를 선택해 자세한 설명을 작성합니다. [Google 스토어 등록정보 현지화 안내](https://developer.chrome.com/docs/webstore/cws-dashboard-listing#localize_your_listing)
4. **검토를 위해 제출(Submit for Review)**을 클릭합니다. 승인 후 바로 공개하려면 자동 게시를 켜 둡니다. 게시가 끝나면 공개 페이지의 버전을 확인합니다. [Google 업데이트 안내](https://developer.chrome.com/docs/webstore/update#submit-the-update)

---

## 스토어 등록정보 참고

| 항목 | 입력 내용 |
|---|---|
| **제품 세부정보** | `manifest.json`의 이름(`linktive`)과 요약 설명이 자동 입력됩니다. |
| **자세한 설명** | 원클릭 북마크 저장(`Alt+Shift+L`), 주소창 `lk` 즉시 검색, 셀프호스팅 서버 API 연동 방법 등 작성 |
| **카테고리** | **생산성(Productivity)** 또는 **도구(Tools)** |
| **언어** | 한국어와 영어 스토어 설명을 각 언어로 작성 |
| **스토어 아이콘 (필수)** | `128 × 128 px` PNG (`extension/public/icons/icon128.png` 사용) |
| **스크린샷 (필수, 1~5장)** | `1280 × 800 px` 또는 `640 × 400 px` (16:10 비율) PNG/JPEG — 팝업 저장 화면, `lk` 주소창 검색 화면, 옵션 설정 화면 등 |
| **프로모션 타일 (선택)** | 작은 타일 `440 × 280 px` |

---

## 개인정보 보호 관행(Privacy Practices) 참고

심사 거절을 피하기 위해 단일 목적, 권한 사유, 개인정보처리방침 URL을 정확히 입력해야 합니다.

### 단일 목적 설명 (Single Purpose)
> 사용자가 직접 운영하는 셀프호스팅 linktive 서버에 현재 웹페이지를 북마크로 저장하고, 주소창에서 저장된 북마크를 검색하기 위한 확장 프로그램입니다.

### 권한별 사용 사유
- **`activeTab`**: 팝업(또는 단축키 `Alt+Shift+L`)을 열었을 때 현재 활성 탭의 URL과 제목을 가져와 저장 폼에 채웁니다.
- **`storage`**: 사용자가 입력한 셀프호스팅 서버 주소, API 키, 기본 공간 ID를 브라우저 로컬(`chrome.storage.local`)에 저장하기 위해 사용합니다.
- **호스트 권한 (`http://*/*`, `https://*/*`)**: linktive는 사용자가 직접 호스팅하는 서버(로컬 IP, Tailscale, 개인 도메인 등)와 통신하므로, 사용자가 지정한 임의의 HTTP/HTTPS 서버로 REST API 요청을 보내기 위해 필요합니다.

### 데이터 사용 공개 및 개인정보처리방침 URL
- **데이터 전송**: 사용자가 입력한 서버 URL, API 키, 저장할 웹페이지 URL·제목·메모 등 북마크 정보, `lk` 검색어는 **오직 사용자가 설정한 본인 linktive 서버로만 전송**되며 개발자 서버로 수집·판매하지 않습니다.
- **개인정보처리방침 URL**: 저장소 루트의 `PRIVACY.md`를 사용합니다. [linktive 개인정보처리방침](https://github.com/daytivehq/linktive/blob/main/PRIVACY.md)

---

## 처음 등록하는 경우

개발자 대시보드에서 **새 항목 추가(Add new item)**로 ZIP을 올리고 스토어 등록정보, 개인정보 보호 관행, 배포 범위를 입력한 뒤 심사를 요청합니다. [Google 최초 등록 안내](https://developer.chrome.com/docs/webstore/publish)
