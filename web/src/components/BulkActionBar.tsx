import { useMemo, useState } from 'react';
import { FolderInput, Star, Tag, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { BulkBookmarkAction, Collection } from '../types/bookmark';
import { flattenCollectionsTree } from '../utils/collections';

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  collections: Collection[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRequestDelete: () => void;
  onExecute: (payload: {
    action: BulkBookmarkAction;
    collection_id?: string | null;
    tags?: string[];
  }) => Promise<void>;
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  collections,
  onSelectAll,
  onClearSelection,
  onRequestDelete,
  onExecute,
}: BulkActionBarProps) {
  const { t } = useI18n();
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagAction, setTagAction] = useState<'tags_add' | 'tags_set' | 'tags_remove'>('tags_add');
  const [tagsInput, setTagsInput] = useState('');
  const [busy, setBusy] = useState(false);

  const hierarchicalCollections = useMemo(
    () => flattenCollectionsTree(collections),
    [collections],
  );

  const run = async (payload: {
    action: BulkBookmarkAction;
    collection_id?: string | null;
    tags?: string[];
  }) => {
    setBusy(true);
    try {
      await onExecute(payload);
      setMoveOpen(false);
      setTagOpen(false);
      setTagsInput('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/80 px-3.5 py-2.5 text-xs">
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-sky-900">
          {t('bulk.selectedCount', { count: selectedCount })}
        </span>
        <button
          type="button"
          onClick={selectedCount === totalCount ? onClearSelection : onSelectAll}
          className="rounded-md bg-white px-2 py-1 font-medium text-slate-700 shadow-2xs hover:bg-slate-100"
        >
          {selectedCount === totalCount ? t('bulk.clearAll') : t('bulk.selectAll')}
        </button>
      </div>

      <div className="relative flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={selectedCount === 0 || busy}
          onClick={() => void run({ action: 'favorite' })}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40"
        >
          <Star className="h-3.5 w-3.5 text-amber-500" />
          <span>{t('bulk.favorite')}</span>
        </button>

        <button
          type="button"
          disabled={selectedCount === 0 || busy}
          onClick={() => void run({ action: 'unfavorite' })}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40"
        >
          <span>{t('bulk.unfavorite')}</span>
        </button>

        <button
          type="button"
          disabled={selectedCount === 0 || busy}
          onClick={() => {
            setMoveOpen((v) => !v);
            setTagOpen(false);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40"
        >
          <FolderInput className="h-3.5 w-3.5 text-sky-600" />
          <span>{t('bulk.move')}</span>
        </button>

        <button
          type="button"
          disabled={selectedCount === 0 || busy}
          onClick={() => {
            setTagOpen((v) => !v);
            setMoveOpen(false);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-100 disabled:opacity-40"
        >
          <Tag className="h-3.5 w-3.5 text-indigo-600" />
          <span>{t('bulk.editTags')}</span>
        </button>

        <button
          type="button"
          disabled={selectedCount === 0 || busy}
          onClick={onRequestDelete}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 font-medium text-rose-600 shadow-2xs hover:bg-rose-50 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>{t('common.delete')}</span>
        </button>

        <button
          type="button"
          onClick={onClearSelection}
          title={t('bulk.closeSelectMode')}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {moveOpen && (
          <div className="absolute right-0 top-9 z-30 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">
              {t('bulk.moveTo')}
            </div>
            <div className="max-h-48 overflow-y-auto">
              <button
                type="button"
                onClick={() => void run({ action: 'move', collection_id: null })}
                className="flex w-full rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-100"
              >
                {t('common.uncollected')}
              </button>
              {hierarchicalCollections.map(({ collection, indentedLabel }) => (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => void run({ action: 'move', collection_id: collection.id })}
                  className="flex w-full truncate rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-100"
                >
                  {indentedLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        {tagOpen && (
          <div className="absolute right-0 top-9 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 text-[11px] font-semibold text-slate-500">
              {t('bulk.batchTags')}
            </div>
            <div className="mb-2 flex gap-1">
              {(
                [
                  ['tags_add', t('bulk.tagsAdd')],
                  ['tags_set', t('bulk.tagsSet')],
                  ['tags_remove', t('bulk.tagsRemove')],
                ] as const
              ).map(([act, label]) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => setTagAction(act)}
                  className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] font-medium ${
                    tagAction === act
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t('bulk.tagsPlaceholder')}
              className="mb-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-sky-500"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setTagOpen(false)}
                className="rounded-md px-2.5 py-1 text-slate-500 hover:bg-slate-100"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const tags = tagsInput
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean);
                  void run({ action: tagAction, tags });
                }}
                className="rounded-md bg-sky-600 px-3 py-1 font-medium text-white hover:bg-sky-700"
              >
                {t('bulk.apply')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
