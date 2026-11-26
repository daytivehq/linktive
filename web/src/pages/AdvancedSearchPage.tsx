import { ArrowLeft, Search } from 'lucide-react';
import { useI18n } from '../i18n';

interface AdvancedSearchPageProps {
  onBack: () => void;
  onTryQuery: (query: string) => void;
}

export function AdvancedSearchPage({ onBack, onTryQuery }: AdvancedSearchPageProps) {
  const { locale, t } = useI18n();

  const features = [
    {
      title: t('advSearch.f1Title'),
      desc: t('advSearch.f1Desc'),
      example: locale === 'ko' ? '래명세' : 'tement',
      note: t('advSearch.f1Note'),
    },
    {
      title: t('advSearch.f2Title'),
      desc: t('advSearch.f2Desc'),
      example: locale === 'ko' ? '거래명세' : 'invoicemgr',
      note: t('advSearch.f2Note'),
    },
    {
      title: t('advSearch.f3Title'),
      desc: t('advSearch.f3Desc'),
      example: 'ㄱㄹㅁㅅ',
      note: t('advSearch.f3Note'),
    },
    {
      title: t('advSearch.f4Title'),
      desc: t('advSearch.f4Desc'),
      example: locale === 'ko' ? '집' : 'ai',
      note: t('advSearch.f4Note'),
    },
    {
      title: t('advSearch.f5Title'),
      desc: t('advSearch.f5Desc'),
      example: locale === 'ko' ? '거래 세금' : 'dev guide',
      note: t('advSearch.f5Note'),
    },
  ];

  const operators = [
    { op: locale === 'ko' ? 'tags:세금' : 'tags:dev', desc: t('advSearch.opTagsDesc') },
    { op: locale === 'ko' ? '-tags:임시' : '-tags:temp', desc: t('advSearch.opExcludeTagsDesc') },
    { op: 'site:github.com', desc: t('advSearch.opSiteDesc') },
    { op: locale === 'ko' ? 'in:개발' : 'in:dev', desc: t('advSearch.opInDesc') },
    { op: 'date:2026-11-19', desc: t('advSearch.opDateDesc') },
    { op: 'after:2026-11-01', desc: t('advSearch.opAfterDesc') },
    { op: 'before:2026-11-30', desc: t('advSearch.opBeforeDesc') },
    { op: 'is:favorite', desc: t('advSearch.opFavDesc') },
    { op: 'is:broken', desc: t('advSearch.opBrokenDesc') },
    { op: 'is:blocked', desc: t('advSearch.opBlockedDesc') },
  ];

  const comboExample =
    locale === 'ko'
      ? 'tags:세금 -tags:임시 site:example.com 래명세'
      : 'tags:dev -tags:temp site:github.com react';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('common.backToBookmarks')}</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900">{t('advSearch.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('advSearch.subtitle')}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('advSearch.smartTitle')}</h2>
        <div className="divide-y divide-slate-100">
          {features.map((item) => (
            <div key={item.title} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{item.title}</div>
                <div className="text-xs text-slate-500">
                  {item.desc} <span className="text-slate-400">({item.note})</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onTryQuery(item.example)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-sky-700 hover:bg-sky-50"
              >
                <Search className="h-3 w-3" />
                <span>{item.example}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          {t('advSearch.operatorsTitle')}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3.5 py-2.5 font-semibold">
                  {t('advSearch.colOperator')}
                </th>
                <th className="px-3.5 py-2.5 font-semibold">{t('advSearch.colDesc')}</th>
                <th className="whitespace-nowrap px-3.5 py-2.5 text-right font-semibold">
                  {t('advSearch.colTest')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {operators.map((row) => (
                <tr key={row.op} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3.5 py-2.5 font-mono font-medium text-slate-800">
                    {row.op}
                  </td>
                  <td className="px-3.5 py-2.5 text-slate-600">{row.desc}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onTryQuery(row.op)}
                      className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
                    >
                      {t('advSearch.tryBtn')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">{t('advSearch.comboTitle')}</div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span>
              <code>{comboExample}</code> {t('advSearch.comboDesc')}
            </span>
            <button
              type="button"
              onClick={() => onTryQuery(comboExample)}
              className="shrink-0 rounded-md bg-sky-600 px-2.5 py-1 font-medium text-white hover:bg-sky-700"
            >
              {t('advSearch.runExample')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
