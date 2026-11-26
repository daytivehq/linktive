# linktive REST API 매뉴얼

[English](API.md) | **한국어**

기본 경로는 `/api/v1` 입니다. 웹 UI와 브라우저 확장, 외부 자동화 스크립트(n8n, 크론 백업, 단축어 등)가 모두 동일한 REST API를 사용합니다.

## 1. 인증 방법

웹 UI의 **설정 → API 키** 탭에서 `lkt_...` 토큰을 발급받은 뒤, 요청 헤더에 Bearer 토큰을 포함하세요.

```http
Authorization: Bearer lkt_YOUR_API_KEY
```

비밀번호와 2단계 인증 변경, API 키 관리, 관리자 기능은 로그인한 웹 세션이 필요합니다. 이 경로에 Bearer 키를 보내면 `403`을 반환합니다.

---

## 2. 주요 엔드포인트

### 헬스체크 & 계정
- `GET /api/v1/health` — 서버 및 SQLite 연결 확인 (인증 불필요)
- `GET /api/v1/auth/me` — 내 계정 및 소속(워크스페이스) 목록 조회
- `PATCH /api/v1/auth/settings` — 표시 언어(`language`), 클릭 동작, 보기 모드, 기본 클리핑 방식 등 사용자 설정 저장
- `GET /api/v1/api-keys`, `POST /api/v1/api-keys`, `DELETE /api/v1/api-keys/{keyID}` — API 키 관리

### 소속 (Workspaces)
- `GET /api/v1/workspaces` — 소속 목록 조회
- `POST /api/v1/workspaces` — 새 공유 소속 생성 (`{"name": "가족 공유"}`)
- `PATCH /api/v1/workspaces/{wsID}` — 소속 이름 변경 (Owner)
- `DELETE /api/v1/workspaces/{wsID}` — 공유 소속 삭제 (Owner, 개인 소속 제외)
- `GET/POST /api/v1/workspaces/{wsID}/members`, `DELETE /api/v1/workspaces/{wsID}/members/{userID}` — 멤버 관리

### 컬렉션 & 공개/공유
- `GET /api/v1/workspaces/{wsID}/collections` — 컬렉션 목록 및 북마크 수 조회
- `POST /api/v1/workspaces/{wsID}/collections` — 컬렉션 생성 (`name`, `parent_id`, `description`, `icon`, `color`)
- `PATCH /api/v1/workspaces/{wsID}/collections/{colID}` — 컬렉션 수정 / 상위 폴더 변경
- `DELETE /api/v1/workspaces/{wsID}/collections/{colID}` — 컬렉션 삭제
- `POST /api/v1/workspaces/{wsID}/collections/{colID}/public` — 공개 링크 활성화/비활성화 (`{"enabled": true}`)
- `GET /api/v1/public/collections/{slug}` — 공개된 컬렉션 조회 (인증 불필요)
- `GET/POST /api/v1/workspaces/{wsID}/collections/{colID}/shares`, `DELETE .../shares/{shareID}` — 사용자/소속 공유 관리
- `GET /api/v1/shared-collections` — 내가 공유받은 컬렉션 목록

### 북마크 · 검색 · 일괄 처리
- `GET /api/v1/workspaces/{wsID}/bookmarks`
  - 쿼리 파라미터: `q`, `collection_id` (`uncollected` 가능), `include_children=true`, `favorite=true`, `tag`, `link_status` (`unknown|ok|broken|blocked`), `search_archive` (`true|false`), `sort` (`relevance|newest|oldest|title`), `limit`, `offset`
  - 검색 연산자: `tags:`, `-tags:`, `site:`, `in:`, `date:YYYY-MM-DD`, `after:YYYY-MM-DD`, `before:YYYY-MM-DD`, `is:favorite`, `is:broken`, `is:blocked`
- `POST /api/v1/workspaces/{wsID}/bookmarks`
  - `{"url": "https://example.com", "collection_id": null, "tags": ["개발"], "allow_duplicate": false, "clip_now": false}`
  - `title`·`description`을 비워두면 대상 페이지에서 제목·설명·파비콘을 자동 수집합니다.
  - 중복 URL은 `409 Conflict`를 반환합니다. 열람 권한이 있는 경우에만 `existing`에 기존 북마크를 포함합니다.
- `GET /api/v1/workspaces/{wsID}/bookmarks/{bmID}` — 단일 북마크 조회
- `PATCH /api/v1/workspaces/{wsID}/bookmarks/{bmID}` — 북마크 수정 및 소속 이동(`target_workspace_id`)
- `DELETE /api/v1/workspaces/{wsID}/bookmarks/{bmID}` — 북마크 삭제 (연결된 아카이빙 본문·로컬 이미지도 함께 삭제)
- `POST /api/v1/workspaces/{wsID}/bookmarks/bulk`
  - `action`: `favorite`, `unfavorite`, `move`, `delete`, `tags_add`, `tags_set`, `tags_remove`

### 웹 클리퍼 · 아카이빙 · 사용량
- `GET /api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive` — 아카이빙된 읽기 전용 본문 조회 (소유자 열람 범위 설정 적용)
- `POST /api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive` — 수동 본문 클리핑 실행 또는 수집된 HTML 저장 (`mode`: `readable|snapshot|both`)
- `DELETE /api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive` — 아카이빙 본문 및 로컬 이미지 삭제
- `GET /api/v1/workspaces/{wsID}/bookmarks/{bmID}/export/markdown` — YAML 프론트매터 포함 Markdown(`.md`) 및 이미지 포함 시 `.zip` 다운로드
- `DELETE /api/v1/workspaces/{wsID}/archives` — 해당 소속의 아카이빙 데이터 일괄 비우기
- `GET /api/v1/workspaces/{wsID}/usage` — 소속 내 북마크·태그·컬렉션·아카이빙 개수 및 용량 통계

### 필터 & 링크 점검
- `GET /api/v1/workspaces/{wsID}/filters` — 저장된 필터 목록 조회
- `POST /api/v1/workspaces/{wsID}/filters` — 필터 생성 (`name`, `query`, `icon`, `color`)
- `PATCH /api/v1/workspaces/{wsID}/filters/{filterID}` — 필터 수정
- `DELETE /api/v1/workspaces/{wsID}/filters/{filterID}` — 필터 삭제
- `POST /api/v1/workspaces/{wsID}/bookmarks/{bmID}/check-link` — 단일 북마크 링크 상태 점검
- `POST /api/v1/workspaces/{wsID}/bookmarks/{bmID}/link-status` — 북마크 링크 상태 수동 변경 (`{"link_status": "ok|broken|blocked|unknown"}`)
- `POST /api/v1/workspaces/{wsID}/links/check` — 공간 내 전체(또는 `{"only_unchecked": true}`) 북마크 링크 일괄 점검
- `GET /api/v1/workspaces/{wsID}/links/duplicates` — 동일 URL 중복 북마크 그룹 조회

### 태그 · 통계 · 가져오기/내보내기
- `GET /api/v1/workspaces/{wsID}/tags` — 사용 중인 태그 목록 및 개수
- `PATCH /api/v1/workspaces/{wsID}/tags/{tagName}` — 태그 이름 변경 (기존 태그와 이름 동일 시 자동 병합)
- `DELETE /api/v1/workspaces/{wsID}/tags/{tagName}` — 태그 삭제
- `GET /api/v1/workspaces/{wsID}/stats` — 전체·즐겨찾기·미분류·손상·접근제한·중복 개수
- `GET /api/v1/workspaces/{wsID}/export?format=json|html|csv` — 내보내기
- `POST /api/v1/workspaces/{wsID}/import` — 가져오기 (`multipart/form-data`의 `file`, `format=auto|linktive_json|html|raindrop_csv|linkwarden_json|karakeep_json`, `skip_duplicates=true`)

### 관리자 · 자동 백업 · 아카이빙 정책 (Admin 전용)
- `GET /api/v1/admin/usage` — 서버 전체 DB·에셋·백업 디스크 사용량 및 통계 조회
- `PATCH /api/v1/admin/archive-settings` — 아카이빙 용량·파일 크기 안전장치 (`limit_enabled`, `max_asset_mb`, `max_bookmark_mb`) 변경
- `POST /api/v1/admin/assets/cleanup` — DB 참조가 없는 고아 에셋 파일 정리
- `GET /api/v1/admin/backups` — 자동 백업 설정 및 저장된 스냅샷 목록 조회
- `PATCH /api/v1/admin/backups/settings` — 자동 백업 활성화·주기(시간)·보관 개수 설정
- `POST /api/v1/admin/backups/run` — SQLite 온라인 스냅샷 백업 즉시 실행
- `GET /api/v1/admin/backups/{filename}`, `DELETE /api/v1/admin/backups/{filename}` — 백업 파일 다운로드/삭제

---

## 3. curl 예시

```bash
# 북마크 검색 (한국어 중간 글자 + 태그 필터)
curl -sS "http://localhost:18080/api/v1/workspaces/<WS_ID>/bookmarks?q=tags:세금+래명세" \
  -H "Authorization: Bearer lkt_YOUR_API_KEY"

# URL만으로 북마크 추가
curl -sS -X POST "http://localhost:18080/api/v1/workspaces/<WS_ID>/bookmarks" \
  -H "Authorization: Bearer lkt_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"naver.com"}'

# 소속의 북마크·컬렉션을 JSON으로 저장
curl -sS "http://localhost:18080/api/v1/workspaces/<WS_ID>/export?format=json" \
  -H "Authorization: Bearer lkt_YOUR_API_KEY" -o backup.json
```
