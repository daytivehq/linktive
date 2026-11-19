# linktive

가볍고 빠른 Docker 기반 북마크·사이트 관리 서비스 (React + Vite + Go + SQLite).

## 디렉터리 구조

- `cmd/server`: Go HTTP 서버 엔트리포인트
- `internal/config`: 환경변수 기반 설정
- `internal/domain`: 핵심 도메인 모델 (`User`, `Workspace`, `Collection`, `Bookmark`, `SavedFilter`)
- `internal/store`: 저장소 및 검색 인터페이스 (`Store`, `SearchProvider`)
- `internal/store/sqlite`: SQLite + FTS5(`trigram`) 구현 및 마이그레이션
- `internal/search`: 검색 연산자 파서 및 공백 제거 정규화 유틸리티
- `internal/httpapi`: REST API 라우터 및 SPA fallback 핸들러
- `internal/webembed`: Go 바이너리에 내장되는 프론트엔드 정적 자산
- `web/`: React + Vite + TypeScript + Tailwind CSS 프론트엔드
- `extension/`: 브라우저 확장(`lk` 주소창 검색) 소스 예정 위치

## Docker 실행

```bash
docker compose up --build -d
```

헬스체크:

```bash
curl http://localhost:18080/api/v1/health
```

## 프론트엔드 로컬 개발

```bash
cd web
npm install
npm run dev
```
