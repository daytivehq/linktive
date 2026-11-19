import { ArrowLeft, Search } from 'lucide-react';

interface AdvancedSearchPageProps {
  onBack: () => void;
  onTryQuery: (query: string) => void;
}

const KOREAN_FEATURES = [
  {
    title: '단어 중간 글자 검색',
    desc: '단어 앞부분이 아니어도 3글자 이상이면 중간 글자만으로 정확히 찾습니다.',
    example: '래명세',
    note: '"거래명세서 자동 발행" 매칭',
  },
  {
    title: '띄어쓰기 무시 검색',
    desc: '제목이나 메모에 띄어쓰기가 있든 없든 이어 붙여 입력해도 매칭됩니다.',
    example: '거래명세',
    note: '"거래 명세서 관리" 매칭',
  },
  {
    title: '한글 초성 검색',
    desc: '초성만 입력해도 제목·태그·메모·설명을 빠르게 찾을 수 있습니다.',
    example: 'ㄱㄹㅁㅅ',
    note: '"거래명세서" 매칭',
  },
  {
    title: '1~2글자 짧은 단어 검색',
    desc: '한국어에서 자주 쓰이는 1~2글자 단어도 누락 없이 검색됩니다.',
    example: '집',
    note: '1글자·2글자 부분 일치 지원',
  },
  {
    title: '복합 AND 검색',
    desc: '공백으로 여러 단어를 입력하면 모든 단어가 포함된 북마크만 조회합니다.',
    example: '거래 세금',
    note: '"거래"와 "세금" 모두 포함',
  },
];

const OPERATORS = [
  { op: 'tags:세금', desc: '특정 태그가 달린 북마크만 조회 (tag:도 동일 지원)' },
  { op: '-tags:임시', desc: '특정 태그가 달린 북마크 제외' },
  { op: 'site:github.com', desc: '특정 도메인 또는 하위 도메인 필터링' },
  { op: 'in:개발', desc: '특정 컬렉션 이름 안의 북마크만 조회' },
  { op: 'date:2026-11-19', desc: '특정 날짜(YYYY-MM-DD)에 추가된 북마크' },
  { op: 'after:2026-11-01', desc: '해당 날짜 이후에 추가된 북마크' },
  { op: 'before:2026-11-30', desc: '해당 날짜 이전에 추가된 북마크' },
  { op: 'is:favorite', desc: '즐겨찾기에 등록된 북마크만 조회' },
  { op: 'is:broken', desc: '손상된 링크로 표시된 북마크만 조회' },
  { op: 'is:blocked', desc: '접근 제한(차단) 상태로 표시된 북마크만 조회' },
];

export function AdvancedSearchPage({ onBack, onTryQuery }: AdvancedSearchPageProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>북마크로 돌아가기</span>
        </button>
        <h1 className="text-xl font-bold text-slate-900">Advanced Search 가이드</h1>
        <p className="mt-1 text-sm text-slate-600">
          한국어 부분·초성 검색과 연산자를 조합해 원하는 사이트를 빠르게 찾을 수 있습니다.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">한국어 스마트 검색</h2>
        <div className="divide-y divide-slate-100">
          {KOREAN_FEATURES.map((item) => (
            <div key={item.title} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">{item.title}</div>
                <div className="text-xs text-slate-500">
                  {item.desc} <span className="text-slate-400">({item.note})</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onTryQuery(item.example)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-sky-700 hover:bg-sky-50"
              >
                <Search className="h-3 w-3" />
                <span>{item.example}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">검색 연산자 및 복합 검색</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">연산자</th>
                <th className="px-3.5 py-2.5 font-semibold">설명</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">테스트</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {OPERATORS.map((row) => (
                <tr key={row.op} className="hover:bg-slate-50">
                  <td className="px-3.5 py-2.5 font-mono font-medium text-slate-800">{row.op}</td>
                  <td className="px-3.5 py-2.5 text-slate-600">{row.desc}</td>
                  <td className="px-3.5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onTryQuery(row.op)}
                      className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
                    >
                      검색해보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">복합 검색 예시</div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span>
              <code>tags:세금 -tags:임시 site:example.com 래명세</code> — 세금 태그는 포함하고
              임시 태그는 제외하며, example.com 도메인에서 "래명세"가 들어간 북마크 조회
            </span>
            <button
              type="button"
              onClick={() => onTryQuery('tags:세금 -tags:임시 site:example.com 래명세')}
              className="rounded-md bg-sky-600 px-2.5 py-1 font-medium text-white hover:bg-sky-700"
            >
              예시 실행
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
