# Chrome 웹 스토어 확장 프로그램 등록 가이드 (linktive)

개발자 계정 등록이 완료된 상태에서 `linktive` 브라우저 확장 프로그램(`extension/`)을 Chrome 웹 스토어에 업로드하고 심사를 통과하기 위한 절차입니다.

---

## 1. 배포용 `.zip` 파일 만들기

Chrome 웹 스토어는 폴더가 아니라 **`.zip` 파일**만 업로드할 수 있습니다. 반드시 `extension/` 전체가 아니라 **빌드된 `extension/dist/` 내부 파일들**을 압축해야 `manifest.json`이 압축 최상위에 위치합니다.

```bash
cd extension
npm ci
npm run build
cd dist
zip -r ../linktive-extension-0.3.0.zip .
```

압축 최상위에 `manifest.json`, `background.js`, `popup.html`, `options.html`, `icons/`, `assets/`가 바로 들어 있어야 합니다.

---

## 2. 개발자 대시보드에 항목 업로드

1. [Chrome 웹 스토어 개발자 대시보드](https://chrome.google.com/webstore/devconsole)에 로그인합니다.
2. 오른쪽 상단 **새 항목 추가(+ New Item)**를 클릭합니다.
3. 생성한 `linktive-extension-0.3.0.zip` 파일을 업로드합니다.

기존 항목을 업데이트할 때는 기존 linktive 항목의 **패키지** 탭에서 새 ZIP을 업로드합니다. `extension/public/manifest.json`의 버전은 배포 중인 버전보다 높아야 합니다. 업로드 전 압축 해제한 확장을 설치해 저장 팝업, `lk` 검색, 설정의 Chrome 웹 스토어·GitHub 링크를 확인하세요. [Chrome 웹 스토어 업데이트 공식 가이드](https://developer.chrome.com/docs/webstore/update)

---

## 3. 스토어 등록정보(Store Listing) 입력

| 항목 | 입력 내용 |
|---|---|
| **제품 세부정보** | `manifest.json`의 이름(`linktive`)과 요약 설명이 자동 입력됩니다. |
| **자세한 설명** | 원클릭 북마크 저장(`Alt+Shift+L`), 주소창 `lk` 즉시 검색, 셀프호스팅 서버 API 연동 방법 등 작성 |
| **카테고리** | **생산성(Productivity)** 또는 **도구(Tools)** |
| **언어** | **한국어** (필요 시 영어 병기) |
| **스토어 아이콘 (필수)** | `128 × 128 px` PNG (`extension/public/icons/icon128.png` 사용) |
| **스크린샷 (필수, 1~5장)** | `1280 × 800 px` 또는 `640 × 400 px` (16:10 비율) PNG/JPEG — 팝업 저장 화면, `lk` 주소창 검색 화면, 옵션 설정 화면 등 |
| **프로모션 타일 (선택)** | 작은 타일 `440 × 280 px` |

---

## 4. 개인정보 보호 관행(Privacy Practices) 작성

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

## 5. 배포 설정 및 제출

1. **계정(Account)** 탭에서 연락처 이메일 인증이 완료되어 있는지 확인합니다.
2. **배포(Distribution)** 탭에서 공개 범위(**공개** 또는 링크 소유자만 설치 가능한 **미등록**)와 배포 지역을 선택합니다.
3. **변경사항 저장** 후 **검토를 위해 제출(Submit for Review)**을 클릭합니다.
4. 호스트 권한(`http://*/*`, `https://*/*`)을 사용하므로 자동 심사 외에 수동 심사가 함께 진행될 수 있으며, 심사 메모에 *"Self-hosted open-source bookmark manager client; users configure their own server URL and Bearer API key in the options page."*라고 남기면 심사가 수월합니다.
