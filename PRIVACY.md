# 개인정보처리방침 (Privacy Policy) — linktive 브라우저 확장 프로그램

최종 업데이트: 2026-11-19

**linktive** 브라우저 확장 프로그램("본 확장 프로그램")은 사용자가 직접 운영하는 셀프호스팅 linktive 서버에 웹페이지를 북마크로 저장하고 검색하기 위한 오픈소스 클라이언트입니다. 본 확장 프로그램은 사용자의 개인정보를 최우선으로 보호합니다.

---

## 1. 수집·저장 및 전송되는 데이터

본 확장 프로그램은 **개발자가 운영하는 어떠한 외부 서버로도 데이터를 수집·전송하지 않습니다.**  
모든 데이터는 사용자 기기 내부 또는 **사용자가 직접 지정한 본인 소유의 linktive 서버**에만 처리됩니다.

1. **브라우저 로컬 저장소 (`chrome.storage.local`)에 저장되는 정보**
   - 사용자가 설정 화면에서 직접 입력한 **linktive 서버 주소(URL)**
   - 사용자가 발급받아 입력한 **API 키 (`lkt_...`)**
   - 사용자가 선택한 **기본 공간 ID (`defaultWorkspaceId`)**

2. **사용자 지정 linktive 서버로 전송되는 정보**
   - 사용자가 확장 프로그램 팝업을 열거나 저장을 실행할 때: 현재 탭의 **URL과 제목**, 사용자가 입력한 **컬렉션·태그·메모·즐겨찾기 여부**
   - 사용자가 브라우저 주소창에 `lk` 키워드로 검색어를 입력할 때: **입력한 검색어**
   - 위 요청 시 인증을 위한 **API 키(`Authorization: Bearer ...` 헤더)**

3. **수집하지 않는 정보**
   - 사용자의 전체 브라우징 기록, 방문 이력, 백그라운드 탭 정보, 쿠키, 광고 식별자, 사용 통계(Analytics/Telemetry)를 수집하거나 추적하지 않습니다.

---

## 2. 데이터의 제3자 제공 및 판매

본 확장 프로그램은 어떠한 사용자 데이터도 제3자에게 판매, 임대, 공유 또는 광고·프로파일링 목적으로 사용하지 않습니다.

---

## 3. 데이터 보관 및 삭제

- 확장 프로그램에 저장된 서버 주소와 API 키는 사용자 브라우저의 `chrome.storage.local`에만 저장됩니다.
- 사용자는 언제든지 확장 프로그램 설정을 변경하거나 브라우저에서 확장 프로그램을 삭제(제거)함으로써 로컬에 저장된 모든 데이터를 즉시 삭제할 수 있습니다.
- linktive 서버에 저장된 북마크 및 계정 데이터는 사용자가 직접 운영하는 서버 내 SQLite 데이터베이스에서 직접 관리·삭제할 수 있습니다.

---

## 4. 문의처

본 개인정보처리방침에 관한 문의는 linktive GitHub 저장소의 Issues 페이지를 통해 남겨주시기 바랍니다.

---

# Privacy Policy (English) — linktive Browser Extension

Last updated: 2026-11-19

The **linktive** browser extension is an open-source client for saving and searching bookmarks on a user's own self-hosted linktive server.

1. **No Developer Collection or Tracking**: This extension does **not** collect, store, or transmit any personal data, browsing history, analytics, or telemetry to the extension developer or any third party.
2. **Local Storage (`chrome.storage.local`)**: Only the server URL, Bearer API key, and default workspace ID explicitly entered by the user are stored locally on the user's device.
3. **User-Configured Server Communication**: When the user opens the extension popup to save a bookmark or uses the `lk` omnibox search keyword, the active tab's URL/title or search query is sent strictly to the self-hosted linktive server URL configured by the user.
4. **No Sale or Third-Party Sharing**: User data is never sold, rented, or transferred to third parties, and is used solely to provide bookmarking and search functionality with the user's own linktive server.
5. **Data Deletion**: Users can remove all locally stored configuration at any time by clearing the extension's storage or uninstalling the extension.
