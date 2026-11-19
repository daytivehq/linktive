import { useState } from 'react';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

interface ApiDocsPageProps {
  activeWorkspaceId: string;
  onBack: () => void;
}

export function ApiDocsPage({ activeWorkspaceId, onBack }: ApiDocsPageProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:18080';

  const handleCopy = async (id: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(id);
      window.setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const examples = [
    {
      id: 'list',
      title: '1. 북마크 목록 조회 및 한국어 검색',
      desc: '중간글자(래명세), 초성(ㄱㄹ), 1~2글자, 연산자(tags:, -tags:, site:, in:, date:, after:, before:, is:favorite)를 그대로 전달합니다.',
      cmd: `curl -sS "${origin}/api/v1/workspaces/${activeWorkspaceId}/bookmarks?q=%EB%9E%98%EB%AA%85%EC%84%B8&limit=20" \\\n  -H "Authorization: Bearer lkt_YOUR_API_KEY"`,
    },
    {
      id: 'create',
      title: '2. 북마크 추가 (URL만 전달 시 제목·설명·파비콘 자동 수집)',
      desc: 'https:// 를 생략해도 자동 보정되며, 중복 URL 감지 시 409 Conflict와 기존 북마크 정보를 반환합니다.',
      cmd: `curl -sS -X POST "${origin}/api/v1/workspaces/${activeWorkspaceId}/bookmarks" \\\n  -H "Authorization: Bearer lkt_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://example.com","tags":["개발","문서"],"is_favorite":true}'`,
    },
    {
      id: 'bulk',
      title: '3. 북마크 일괄 수정 (Bulk)',
      desc: 'action: favorite | unfavorite | move | delete | tags_add | tags_set | tags_remove',
      cmd: `curl -sS -X POST "${origin}/api/v1/workspaces/${activeWorkspaceId}/bookmarks/bulk" \\\n  -H "Authorization: Bearer lkt_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"bookmark_ids":["BM_ID_1","BM_ID_2"],"action":"tags_add","tags":["정리됨"]}'`,
    },
    {
      id: 'export',
      title: '4. 전체 데이터 백업 내보내기 (JSON / HTML / CSV)',
      desc: '크론잡이나 홈서버 백업 스크립트에서 주기적으로 JSON 전체 백업을 받아둘 수 있습니다.',
      cmd: `curl -sS "${origin}/api/v1/workspaces/${activeWorkspaceId}/export?format=json" \\\n  -H "Authorization: Bearer lkt_YOUR_API_KEY" -o linktive-backup.json`,
    },
  ];

  const endpoints = [
    { method: 'GET', path: '/api/v1/health', auth: '불필요', desc: '서버 및 SQLite DB 상태 확인' },
    { method: 'GET', path: '/api/v1/auth/me', auth: '필요', desc: '현재 사용자 정보 및 소속 목록 조회' },
    { method: 'GET', path: '/api/v1/workspaces', auth: '필요', desc: '소속(개인/공유) 목록 조회' },
    { method: 'POST', path: '/api/v1/workspaces', auth: '필요', desc: '새 공유 소속 생성' },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}', auth: 'Owner', desc: '소속 이름 변경' },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}', auth: 'Owner', desc: '공유 소속 삭제' },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/collections', auth: 'Viewer+', desc: '컬렉션 목록 및 북마크 수 조회' },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/collections', auth: 'Editor+', desc: '컬렉션 생성' },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}/collections/{colID}', auth: 'Editor+', desc: '컬렉션 수정/상위 폴더 이동' },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/collections/{colID}', auth: 'Editor+', desc: '컬렉션 삭제' },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/bookmarks', auth: 'Viewer+', desc: '북마크 조회 및 검색 (`q`, `collection_id`, `favorite`, `tag`, `sort`, `limit`, `offset`)' },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/bookmarks', auth: 'Editor+', desc: '북마크 추가 (중복 시 409, `allow_duplicate: true`로 허용 가능)' },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}', auth: 'Viewer+', desc: '단일 북마크 상세 조회' },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}', auth: 'Editor+', desc: '북마크 수정 및 타 소속 이동(`target_workspace_id`)' },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}', auth: 'Editor+', desc: '북마크 삭제' },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/bookmarks/bulk', auth: 'Editor+', desc: '여러 북마크 일괄 처리' },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/tags', auth: 'Viewer+', desc: '태그 목록 및 개수 조회' },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}/tags/{tagName}', auth: 'Editor+', desc: '태그 이름 수정/병합' },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/tags/{tagName}', auth: 'Editor+', desc: '태그 삭제' },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/export?format=json|html|csv', auth: 'Viewer+', desc: '북마크 내보내기' },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/import', auth: 'Editor+', desc: '가져오기 (JSON/HTML/Raindrop CSV/Linkwarden/Karakeep)' },
    { method: 'GET', path: '/api/v1/public/collections/{slug}', auth: '불필요', desc: '공개 링크 컬렉션 조회' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>설정으로 돌아가기</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900">REST API 활용 매뉴얼</h1>
        <p className="mt-1 text-sm text-slate-600">
          브라우저 확장, n8n/단축어 자동화, 백업 스크립트에서 아래 REST API를 바로 호출할 수
          있습니다.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">인증 방식</h2>
        <p className="text-xs text-slate-600">
          <strong>설정 → API 키</strong> 탭에서 <code>lkt_...</code> 토큰을 발급한 뒤, 모든 요청
          헤더에 아래와 같이 Bearer 토큰을 포함하세요. 현재 선택된 소속 ID는{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">{activeWorkspaceId}</code> 입니다.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
          Authorization: Bearer lkt_YOUR_API_KEY
        </pre>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">빠른 사용 예시 (curl)</h2>
        {examples.map((ex) => (
          <div key={ex.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-800">{ex.title}</div>
              <button
                type="button"
                onClick={() => void handleCopy(ex.id, ex.cmd)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
              >
                {copiedKey === ex.id ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span>복사됨</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>복사</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500">{ex.desc}</p>
            <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
              {ex.cmd}
            </pre>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">전체 엔드포인트 목록</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Method</th>
                <th className="px-3 py-2 font-semibold">Endpoint</th>
                <th className="px-3 py-2 font-semibold">권한</th>
                <th className="px-3 py-2 font-semibold">설명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {endpoints.map((ep) => (
                <tr key={ep.method + ep.path} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono font-semibold text-sky-700">{ep.method}</td>
                  <td className="px-3 py-2 font-mono text-slate-800">{ep.path}</td>
                  <td className="px-3 py-2 text-slate-500">{ep.auth}</td>
                  <td className="px-3 py-2 text-slate-600">{ep.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
