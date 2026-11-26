import { useState } from 'react';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { useI18n } from '../i18n';
import { copyToClipboard } from '../utils/clipboard';

interface ApiDocsPageProps {
  activeWorkspaceId: string;
  onBack: () => void;
}

export function ApiDocsPage({ activeWorkspaceId, onBack }: ApiDocsPageProps) {
  const { locale, t } = useI18n();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:18080';

  const handleCopy = async (id: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(id);
      window.setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const sampleCreateBody =
    locale === 'ko'
      ? '{"url":"https://example.com","tags":["개발","문서"],"is_favorite":true}'
      : '{"url":"https://example.com","tags":["dev","docs"],"is_favorite":true}';
  const sampleBulkBody =
    locale === 'ko'
      ? '{"bookmark_ids":["BM_ID_1","BM_ID_2"],"action":"tags_add","tags":["정리됨"]}'
      : '{"bookmark_ids":["BM_ID_1","BM_ID_2"],"action":"tags_add","tags":["reviewed"]}';

  const examples = [
    {
      id: 'list',
      title: t('apiDocs.ex1Title'),
      desc: t('apiDocs.ex1Desc'),
      cmd: `curl -sS "${origin}/api/v1/workspaces/${activeWorkspaceId}/bookmarks?q=tags%3Adev&limit=20" \\\n  -H "Authorization: Bearer lkt_YOUR_API_KEY"`,
    },
    {
      id: 'create',
      title: t('apiDocs.ex2Title'),
      desc: t('apiDocs.ex2Desc'),
      cmd: `curl -sS -X POST "${origin}/api/v1/workspaces/${activeWorkspaceId}/bookmarks" \\\n  -H "Authorization: Bearer lkt_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${sampleCreateBody}'`,
    },
    {
      id: 'bulk',
      title: t('apiDocs.ex3Title'),
      desc: t('apiDocs.ex3Desc'),
      cmd: `curl -sS -X POST "${origin}/api/v1/workspaces/${activeWorkspaceId}/bookmarks/bulk" \\\n  -H "Authorization: Bearer lkt_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${sampleBulkBody}'`,
    },
    {
      id: 'export',
      title: t('apiDocs.ex4Title'),
      desc: t('apiDocs.ex4Desc'),
      cmd: `curl -sS "${origin}/api/v1/workspaces/${activeWorkspaceId}/export?format=json" \\\n  -H "Authorization: Bearer lkt_YOUR_API_KEY" -o linktive-backup.json`,
    },
  ];

  const endpoints = [
    { method: 'GET', path: '/api/v1/health', auth: t('apiDocs.authPublic'), desc: t('apiDocs.ep.health') },
    { method: 'GET', path: '/api/v1/auth/me', auth: t('apiDocs.authRequired'), desc: t('apiDocs.ep.me') },
    { method: 'GET', path: '/api/v1/workspaces', auth: t('apiDocs.authRequired'), desc: t('apiDocs.ep.wsList') },
    { method: 'POST', path: '/api/v1/workspaces', auth: t('apiDocs.authRequired'), desc: t('apiDocs.ep.wsCreate') },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}', auth: t('apiDocs.authOwner'), desc: t('apiDocs.ep.wsRename') },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}', auth: t('apiDocs.authOwner'), desc: t('apiDocs.ep.wsDelete') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/collections', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.colList') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/collections', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.colCreate') },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}/collections/{colID}', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.colUpdate') },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/collections/{colID}', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.colDelete') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/bookmarks', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.bmList') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/bookmarks', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.bmCreate') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.bmGet') },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.bmUpdate') },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.bmDelete') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/bookmarks/bulk', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.bmBulk') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.archiveGet') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.archiveCreate') },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}/archive', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.archiveDelete') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}/export/markdown', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.exportMd') },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/archives', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.clearArchives') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/usage', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.usage') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}/check-link', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.checkOne') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/bookmarks/{bmID}/link-status', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.linkStatus') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/links/check', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.checkAll') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/links/duplicates', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.duplicates') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/filters', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.filterList') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/filters', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.filterCreate') },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}/filters/{filterID}', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.filterUpdate') },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/filters/{filterID}', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.filterDelete') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/tags', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.tagList') },
    { method: 'PATCH', path: '/api/v1/workspaces/{wsID}/tags/{tagName}', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.tagRename') },
    { method: 'DELETE', path: '/api/v1/workspaces/{wsID}/tags/{tagName}', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.tagDelete') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/stats', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.stats') },
    { method: 'GET', path: '/api/v1/workspaces/{wsID}/export?format=json|html|csv', auth: t('apiDocs.authViewer'), desc: t('apiDocs.ep.export') },
    { method: 'POST', path: '/api/v1/workspaces/{wsID}/import', auth: t('apiDocs.authEditor'), desc: t('apiDocs.ep.import') },
    { method: 'GET', path: '/api/v1/public/collections/{slug}', auth: t('apiDocs.authPublic'), desc: t('apiDocs.ep.publicCol') },
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
          <span>{t('common.backToSettings')}</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900">{t('apiDocs.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('apiDocs.subtitle')}</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">{t('apiDocs.authTitle')}</h2>
        <p className="text-xs text-slate-600">
          {t('apiDocs.authDesc')}{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">{activeWorkspaceId}</code>
        </p>
        <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
          Authorization: Bearer lkt_YOUR_API_KEY
        </pre>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">{t('apiDocs.examplesTitle')}</h2>
        {examples.map((ex) => (
          <div key={ex.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800">{ex.title}</div>
              <button
                type="button"
                onClick={() => void handleCopy(ex.id, ex.cmd)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
              >
                {copiedKey === ex.id ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span>{t('common.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>{t('common.copy')}</span>
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
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('apiDocs.endpointsTitle')}</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">{t('apiDocs.colMethod')}</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">{t('apiDocs.colEndpoint')}</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">{t('apiDocs.colAuth')}</th>
                <th className="px-3 py-2 font-semibold">{t('apiDocs.colDesc')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {endpoints.map((ep) => (
                <tr key={ep.method + ep.path} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-sky-700">
                    {ep.method}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-800">{ep.path}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">{ep.auth}</td>
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
