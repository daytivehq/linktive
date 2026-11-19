# linktive

가볍고 빠른 셀프호스팅 북마크 관리 서비스입니다.

## 주요 기능

- **심플한 3단 UI**: 리스트/카드 보기 전환, 표시 항목 선택, 드래그 앤 드롭 컬렉션 정리, 다중 선택 일괄 편집
- **강력한 한국어 검색**: 중간 글자(`래명세` → `거래명세서`), 초성(`ㄱㄹ`), 1~2글자, 띄어쓰기 무시, 연산자(`tags:`, `-tags:`, `site:`, `in:`, `date:`, `is:favorite`) 지원
- **URL만으로 빠른 저장**: `https://` 생략 가능, 제목·설명·파비콘 자동 수집, 중복 URL 감지
- **컬렉션 & 공유**: 계층 폴더, 아이콘(기본 + Iconify)·색상 커스텀, 로그인 없는 공개 링크(`/share/...`), 사용자/소속 공유(열람·편집 권한)
- **데이터 이동 & 백업**: linktive JSON, 표준 HTML, Raindrop CSV, Linkwarden JSON, Karakeep JSON 가져오기/내보내기
- **계정·보안 & REST API**: TOTP 2FA(OTP), 관리자 콘솔(회원가입 제어·초대 링크·사용자 관리), Bearer API 키

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
- **우클릭 메뉴**: 북마크·컬렉션·태그 위에서 마우스 오른쪽 버튼을 누르면 항목별 작업 메뉴가 열립니다.
- **초대 및 회원가입 제어**: 상단 방패 아이콘(**관리자 설정**)에서 공개 회원가입을 끄고 1회용 초대 링크를 발급할 수 있습니다.
- **REST API**: **설정 → API 키**에서 토큰을 발급할 수 있으며, 자세한 사용법은 [API.md](API.md) 또는 웹 내 **REST API 활용 매뉴얼**(`/api-docs`)에서 확인할 수 있습니다.

---

## 브라우저 확장 프로그램

`extension/` 폴더에 Chrome/Edge(Manifest V3)용 확장 프로그램이 포함되어 있습니다.

1. 빌드: `cd extension && npm install && npm run build`
2. 브라우저에서 `chrome://extensions` (Edge는 `edge://extensions`) 열기 → **개발자 모드** 활성화
3. **압축해제된 확장 프로그램을 로드합니다** 선택 후 `extension/dist` 폴더 지정
4. 확장 프로그램 설정에서 linktive **서버 주소**와 **API 키**(`설정 → API 키`)를 입력

- **빠른 저장**: 확장 아이콘 클릭 또는 `Alt+Shift+L` (macOS: `Cmd+Shift+L`)
- **주소창 즉시 검색**: 주소창에 `lk` 입력 후 `Space`/`Tab` + 검색어 입력

---

## 백업

모든 데이터는 컨테이너의 `/data/linktive.db` (호스트의 `./data` 폴더)에 저장됩니다.  
웹 UI의 **설정 → 가져오기·내보내기**에서 언제든 JSON/HTML/CSV 백업을 내려받을 수 있습니다.
