import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bookmark as BookmarkIcon, ExternalLink, LayoutGrid, List, Search } from 'lucide-react';
import { api } from '../api/client';
import { FaviconBadge } from '../components/FaviconBadge';
import { CollectionIcon } from '../components/IconPicker';
import type { PublicCollectionView, ViewMode } from '../types/bookmark';

export function PublicCollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicCollectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    api
      .getPublicCollection(slug)
      .then((res) => setData(res))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const filteredBookmarks = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.bookmarks;
    return data.bookmarks.filter(
      (bm) =>
        bm.title.toLowerCase().includes(q) ||
        bm.description.toLowerCase().includes(q) ||
        bm.domain.toLowerCase().includes(q) ||
        bm.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [data, filter]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        공유 컬렉션을 불러오는 중...
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <h1 className="text-lg font-bold text-slate-900">공개된 컬렉션을 찾을 수 없습니다</h1>
        <p className="mt-1 text-sm text-slate-500">
          링크가 잘못되었거나 소유자가 공개를 중단했습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white">
              <BookmarkIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">linktive</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              공개 컬렉션
            </span>
          </div>
          <a
            href="/"
            className="text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            내 linktive로 이동
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <CollectionIcon
              name={data.collection.icon}
              color={data.collection.color}
              className="h-6 w-6"
            />
            <h1 className="text-2xl font-bold text-slate-900">{data.collection.name}</h1>
          </div>
          {data.collection.description && (
            <p className="mt-1.5 text-sm text-slate-600">{data.collection.description}</p>
          )}
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="이 컬렉션에서 검색..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{filteredBookmarks.length}개</span>
            <div className="hidden rounded-lg border border-slate-200 bg-white p-0.5 md:flex">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="리스트 형식으로 보기"
                aria-label="리스트형 보기"
                className={`rounded-md p-1.5 ${
                  viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                title="카드 형식으로 보기"
                aria-label="카드형 보기"
                className={`rounded-md p-1.5 ${
                  viewMode === 'card' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {filteredBookmarks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            표시할 북마크가 없습니다.
          </div>
        ) : (
          <div
            className={
              viewMode === 'card'
                ? 'space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3'
                : 'space-y-2.5'
            }
          >
            {filteredBookmarks.map((bm) => (
              <a
                key={bm.id}
                href={bm.url}
                target="_blank"
                rel="noreferrer"
                className="group flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 transition hover:border-sky-300 hover:shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <FaviconBadge faviconUrl={bm.favicon_url} domain={bm.domain} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-900 group-hover:text-sky-600">
                          {bm.title}
                        </div>
                        <div className="truncate text-xs text-slate-400">{bm.domain}</div>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-sky-600" />
                  </div>
                  {bm.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{bm.description}</p>
                  )}
                </div>

                {bm.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1 pt-2 text-xs">
                    {bm.tags.map((tag) => (
                      <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
