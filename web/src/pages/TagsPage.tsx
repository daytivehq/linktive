import { Hash, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';
import type { TagSummary } from '../types/bookmark';

interface TagsPageProps {
  tags: TagSummary[];
  canEdit: boolean;
  onOpenTag: (tagName: string) => void;
  onRequestRename: (tagName: string) => void;
  onRequestDelete: (tagName: string) => void;
}

export function TagsPage({
  tags,
  canEdit,
  onOpenTag,
  onRequestRename,
  onRequestDelete,
}: TagsPageProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t('tagsPage.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('tagsPage.summary', { count: tags.length })}
        </p>
      </div>

      {tags.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {t('tagsPage.empty')}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tags.map((tag) => (
            <div
              key={tag.name}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
            >
              <button
                type="button"
                onClick={() => onOpenTag(tag.name)}
                className="flex items-start justify-between gap-2 text-left"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">
                      {tag.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t('tagsPage.bookmarkCount', { count: tag.count })}
                    </div>
                  </div>
                </div>
              </button>

              {canEdit && (
                <div className="mt-4 flex justify-end gap-1 border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => onRequestRename(tag.name)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>{t('sidebar.renameTag')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestDelete(tag.name)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t('common.delete')}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
