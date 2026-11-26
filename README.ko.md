# linktive

[English](README.md) | **한국어**

가볍고 빠른 셀프호스팅 북마크 · 웹 아카이빙 서비스입니다.

## 주요 기능

- **PC·모바일 최적화 UI**: PC 좌·우 독립 스크롤, 모바일 1줄 상단 바 및 드로어 메뉴, 리스트/카드 보기(PC), 표시 항목 선택, 드래그 앤 드롭 컬렉션 정리, 다중 선택 일괄 편집
- **강력한 한국어 검색 & 필터**: 중간 글자(`래명세` → `거래명세서`), 초성(`ㄱㄹ`), 1~2글자, 띄어쓰기 무시, 저장 본문 통합 검색(On/Off), 연산자(`tags:`, `-tags:`, `site:`, `in:`, `date:`, `after:`, `before:`, `is:favorite`, `is:broken`, `is:blocked`) 및 **필터** 저장
- **웹 클리핑 & 아카이빙**: 수동/자동 본문 수집(**리더 뷰** · **원본 HTML** · **둘 다** 저장 및 추가 저장), 이미지·CSS 로컬 캐싱(`/data/assets`), 큰 화면 보기, **Markdown+이미지(`.zip`)** · **PDF** 내보내기
- **URL만으로 빠른 저장 & 링크 점검**: `https://` 생략 가능, 제목·설명·파비콘 자동 수집, **링크 점검**(손상된 링크·접근 제한·중복 URL 탐지 및 정리)
- **컬렉션 & 공유**: 계층 폴더(전체 접기/펼치기 지원), 아이콘(기본 + Iconify)·색상 커스텀, 로그인 없는 공개 링크(`/share/...`, 아카이빙 본문은 비공개), 사용자/소속 공유(본문 열람 범위 제어 지원)
- **브라우저 확장 프로그램**: Chrome 웹 스토어 공식 배포, 현재 탭 원클릭 저장 및 주소창 `lk` 즉시 검색 지원
- **데이터 이동 · 통계 · 자동 백업**: JSON/HTML/Raindrop CSV/Linkwarden/Karakeep 가져오기·내보내기, 소속/서버 사용량 대시보드, 용량 안전장치(기본 `10MB / 30MB`), SQLite 자동 주기 백업(`/data/backups`)
- **계정·보안 · 다국어 & REST API**: 영어(기본)·한국어 UI 지원, TOTP 2FA(OTP), 관리자 콘솔(회원가입 제어·초대 링크·사용자 관리·고아 에셋 정리·자동 백업), Bearer API 키

---

## 빠른 시작 (Docker)

### 1. `docker-compose.yml` 작성

```yaml
services:
  linktive:
    image: ghcr.io/daytivehq/linktive:latest
    container_name: linktive
    restart: unless-stopped
    ports:
      - "18080:8080"
    volumes:
      - ./data:/data
```

### 2. 실행 및 접속

```bash
docker compose up -d
```

브라우저에서 `http://localhost:18080` 으로 접속하세요.  
**가장 먼저 가입하는 계정이 자동으로 관리자**로 등록됩니다.

> 소스에서 직접 빌드하려면 저장소를 내려받은 뒤 `docker compose up --build -d`를 실행하면 됩니다.

---

## 기본 사용 팁

- **`/` 키**: 어디서든 검색창으로 바로 이동합니다.
- **우클릭 메뉴**: 북마크·컬렉션·필터·태그 위에서 마우스 오른쪽 버튼을 누르면 항목별 작업 메뉴가 열립니다.
- **아카이빙 본문 바로 열기**: 북마크의 **`아카이빙됨`** 배지를 클릭하면 큰 화면 리더 뷰로 바로 열립니다.
- **계정 메뉴 (우측 상단)**: 공간 전환(공유 소속이 있을 때), **설정**(표시 언어 변경 포함), **확장 프로그램**, **관리자 설정**, **로그아웃**, **GitHub 버전 링크**를 이용할 수 있습니다.
- **초대 및 회원가입 제어**: **관리자 설정**에서 공개 회원가입을 끄고 1회용 초대 링크를 발급할 수 있습니다.
- **REST API**: **설정 → API 키**에서 토큰을 발급할 수 있으며, 자세한 사용법은 [API.ko.md](API.ko.md) 또는 웹 내 **REST API 활용 매뉴얼**(`/api-docs`)에서 확인할 수 있습니다.

---

## 브라우저 확장 프로그램

Chrome, Edge 등 Chromium 기반 브라우저에서 바로 설치해 사용할 수 있습니다.

- **Chrome 웹 스토어**: [linktive 설치 페이지](https://chromewebstore.google.com/detail/linktive/opalenmkjhflejpemlkbliiadchgjhje)
- **초기 연결**: 확장 프로그램 설정에서 linktive **서버 주소**와 **API 키**(`설정 → API 키`)를 입력하세요.
- **빠른 저장**: 확장 아이콘 클릭 또는 `Alt+Shift+L` (macOS: `Cmd+Shift+L`)
- **주소창 즉시 검색**: 주소창에 `lk` 입력 후 `Space`/`Tab` + 검색어 입력 (`Enter`: 현재 탭, `Alt+Enter` / macOS `Option+Enter`: 새 탭)

<details>
<summary>개발자 모드(소스 직접 빌드)로 설치하기</summary>

1. 빌드: `cd extension && npm install && npm run build`
2. 브라우저에서 `chrome://extensions` (Edge는 `edge://extensions`) 열기 → **개발자 모드** 활성화
3. **압축해제된 확장 프로그램을 로드합니다** 선택 후 `extension/dist` 폴더 지정

</details>

---

## 내부망 링크 수집

내부망 주소도 북마크로 저장할 수 있습니다. 서버가 내부 사이트의 제목·본문·이미지를 가져오거나 링크 상태를 점검해야 하면 Compose의 `.env`에 `LINKTIVE_ALLOW_PRIVATE_NETWORKS=true`를 지정하세요. 기본값은 `false`입니다. 허용하면 공유 사용자가 요청한 페이지도 서버의 내부망 접근 권한을 사용합니다.

## 백업 및 저장 공간

- **영구 데이터 볼륨(`./data`)**: SQLite DB, `/data/assets`(아카이빙 이미지·CSS), `/data/backups`(자동 백업 스냅샷)가 모두 저장됩니다.
- **자동 서버 백업**: **관리자 설정 → 자동 데이터베이스 백업**에서 주기·보관 개수 설정, 즉시 백업, 다운로드 및 삭제가 가능합니다.
- **용량 관리 & 수동 내보내기**: 웹 UI의 **설정 → 통계·사용량** 및 **가져오기·내보내기**, **관리자 설정**에서 사용량 확인과 고아 에셋 정리, JSON/HTML/CSV 백업 다운로드를 할 수 있습니다.

전체 복구용 사본을 만들 때는 서비스를 정지한 뒤 `./data` 전체를 복사하세요. 아카이브 이미지와 CSS는 `assets`에, 자동 백업에는 SQLite 데이터가 들어갑니다. 복구 시에는 같은 시점의 DB와 파일을 함께 사용하세요.
