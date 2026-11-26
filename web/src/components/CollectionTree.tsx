import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderPlus, MoreHorizontal, Pencil, Share2, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';
import type { Collection } from '../types/bookmark';
import { CollectionIcon } from './IconPicker';

export const MIME_COLLECTION_DRAG = 'application/x-linktive-collection';
export const MIME_BOOKMARK_DRAG = 'application/x-linktive-bookmark';

interface CollectionTreeProps {
  collections: Collection[];
  activeCollectionId?: string;
  canEdit: boolean;
  expandAllSignal?: { expanded: boolean; seq: number };
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string | null) => void;
  onEdit: (col: Collection) => void;
  onShare: (col: Collection) => void;
  onDelete: (col: Collection) => void;
  onMoveCollection: (colId: string, newParentId: string | null) => void;
  onDropBookmark: (bookmarkId: string, targetCollectionId: string) => void;
  onContextMenu?: (e: React.MouseEvent, col: Collection) => void;
}

export function CollectionTree({
  collections,
  activeCollectionId,
  canEdit,
  expandAllSignal,
  onSelect,
  onCreateChild,
  onEdit,
  onShare,
  onDelete,
  onMoveCollection,
  onDropBookmark,
  onContextMenu,
}: CollectionTreeProps) {
  const { locale, t } = useI18n();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draggingColId, setDraggingColId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!expandAllSignal || expandAllSignal.seq === 0) return;
    const next: Record<string, boolean> = {};
    for (const col of collections) {
      next[col.id] = expandAllSignal.expanded;
    }
    setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandAllSignal?.seq]);

  useEffect(() => {
    if (!openMenuId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    const onClickOutside = () => setOpenMenuId(null);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('click', onClickOutside);
    };
  }, [openMenuId]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, Collection[]>();
    for (const col of collections) {
      const key = col.parent_id ?? '__root__';
      const list = map.get(key) ?? [];
      list.push(col);
      map.set(key, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => a.name.localeCompare(b.name, locale));
      map.set(k, list);
    }
    return map;
  }, [collections, locale]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const renderBranch = (parentKey: string, depth: number) => {
    const nodes = childrenMap.get(parentKey) ?? [];
    return nodes.map((col) => {
      const children = childrenMap.get(col.id) ?? [];
      const isExpanded = expanded[col.id] ?? true;
      const isSelected = activeCollectionId === col.id;
      const isDragOver = dragOverId === col.id && draggingColId !== col.id;
      const isMenuOpen = openMenuId === col.id;

      return (
        <div key={col.id} className="relative">
          <div
            onContextMenu={(e) => {
              if (!onContextMenu) return;
              e.preventDefault();
              e.stopPropagation();
              setOpenMenuId(null);
              onContextMenu(e, col);
            }}
            draggable={canEdit}
            onDragStart={(e) => {
              if (!canEdit) return;
              setDraggingColId(col.id);
              e.dataTransfer.setData(MIME_COLLECTION_DRAG, col.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggingColId(null);
              setDragOverId(null);
            }}
            onDragOver={(e) => {
              if (!canEdit) return;
              const types = Array.from(e.dataTransfer.types);
              if (!types.includes(MIME_COLLECTION_DRAG) && !types.includes(MIME_BOOKMARK_DRAG)) {
                return;
              }
              if (draggingColId === col.id) return;
              e.preventDefault();
              setDragOverId(col.id);
            }}
            onDragLeave={() => {
              if (dragOverId === col.id) setDragOverId(null);
            }}
            onDrop={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setDragOverId(null);

              const bookmarkId = e.dataTransfer.getData(MIME_BOOKMARK_DRAG);
              if (bookmarkId) {
                onDropBookmark(bookmarkId, col.id);
                return;
              }

              const sourceColId = e.dataTransfer.getData(MIME_COLLECTION_DRAG) || draggingColId;
              setDraggingColId(null);
              if (sourceColId && sourceColId !== col.id) {
                onMoveCollection(sourceColId, col.id);
              }
            }}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            className={`group flex items-center justify-between rounded-lg py-1 pr-1.5 text-sm transition ${
              isDragOver
                ? 'bg-sky-100 ring-1 ring-sky-400'
                : isSelected
                  ? 'bg-sky-50 font-medium text-sky-700'
                  : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => toggleExpand(col.id)}
                title={t('collectionTree.toggleSub')}
                aria-label={t('collectionTree.toggleSub')}
                className={`flex h-5 w-4 shrink-0 items-center justify-center text-slate-400 ${
                  children.length === 0 ? 'invisible' : ''
                }`}
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => onSelect(col.id)}
                className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
              >
                <CollectionIcon name={col.icon} color={col.color} className="h-4 w-4 shrink-0" />
                <span className="truncate">{col.name}</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId((prev) => (prev === col.id ? null : col.id));
                  }}
                  title={t('collectionTree.menu')}
                  aria-label={t('collectionTree.menu')}
                  className={`rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 ${
                    isMenuOpen ? 'block bg-white text-slate-700' : 'block md:hidden md:group-hover:block'
                  }`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
              <span className={`text-xs text-slate-400 ${canEdit ? 'md:group-hover:hidden' : ''} ${isMenuOpen ? 'hidden' : ''}`}>
                {col.bookmark_count}
              </span>
            </div>
          </div>

          {isMenuOpen && canEdit && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-1 top-8 z-30 min-w-44 whitespace-nowrap rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-lg"
            >
              <button
                type="button"
                onClick={() => {
                  setOpenMenuId(null);
                  onCreateChild(col.id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                <FolderPlus className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span>{t('sidebar.addSubcollection')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenuId(null);
                  onEdit(col);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span>{t('common.edit')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenuId(null);
                  onShare(col);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                <Share2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span>{t('sidebar.shareAndPublic')}</span>
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  setOpenMenuId(null);
                  onDelete(col);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>{t('common.delete')}</span>
              </button>
            </div>
          )}

          {children.length > 0 && isExpanded && renderBranch(col.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-0.5">
      {collections.length === 0 ? (
        <p className="px-2.5 py-2 text-xs text-slate-400">{t('collectionTree.empty')}</p>
      ) : (
        renderBranch('__root__', 0)
      )}

      {canEdit && draggingColId && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId('__root__');
          }}
          onDragLeave={() => {
            if (dragOverId === '__root__') setDragOverId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const sourceId = e.dataTransfer.getData(MIME_COLLECTION_DRAG) || draggingColId;
            setDraggingColId(null);
            setDragOverId(null);
            if (sourceId) onMoveCollection(sourceId, null);
          }}
          className={`mt-2 rounded-lg border border-dashed px-2.5 py-1.5 text-center text-xs ${
            dragOverId === '__root__'
              ? 'border-sky-500 bg-sky-50 text-sky-700'
              : 'border-slate-300 text-slate-500'
          }`}
        >
          {t('collectionTree.dropToRoot')}
        </div>
      )}
    </div>
  );
}
