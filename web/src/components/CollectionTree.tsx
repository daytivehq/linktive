import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import type { Collection } from '../types/bookmark';
import { CollectionIcon } from './IconPicker';

interface CollectionTreeProps {
  collections: Collection[];
  selectedScope: string;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string | null) => void;
  onEdit: (col: Collection) => void;
  onDelete: (col: Collection) => void;
  onMove: (colId: string, newParentId: string | null) => void;
}

export function CollectionTree({
  collections,
  selectedScope,
  canEdit,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
  onMove,
}: CollectionTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const childrenMap = useMemo(() => {
    const map = new Map<string, Collection[]>();
    for (const col of collections) {
      const key = col.parent_id ?? '__root__';
      const list = map.get(key) ?? [];
      list.push(col);
      map.set(key, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      map.set(k, list);
    }
    return map;
  }, [collections]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const renderBranch = (parentKey: string, depth: number) => {
    const nodes = childrenMap.get(parentKey) ?? [];
    return nodes.map((col) => {
      const children = childrenMap.get(col.id) ?? [];
      const isExpanded = expanded[col.id] ?? true;
      const isSelected = selectedScope === col.id;
      const isDragOver = dragOverId === col.id && draggingId !== col.id;

      return (
        <div key={col.id}>
          <div
            draggable={canEdit}
            onDragStart={(e) => {
              if (!canEdit) return;
              setDraggingId(col.id);
              e.dataTransfer.setData('text/plain', col.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDragOverId(null);
            }}
            onDragOver={(e) => {
              if (!canEdit || !draggingId || draggingId === col.id) return;
              e.preventDefault();
              setDragOverId(col.id);
            }}
            onDragLeave={() => {
              if (dragOverId === col.id) setDragOverId(null);
            }}
            onDrop={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              const sourceId = e.dataTransfer.getData('text/plain') || draggingId;
              setDraggingId(null);
              setDragOverId(null);
              if (sourceId && sourceId !== col.id) {
                onMove(sourceId, col.id);
              }
            }}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            className={`group flex items-center justify-between rounded-lg pr-1.5 py-1 text-sm transition ${
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
                className={`flex h-5 w-4 shrink-0 items-center justify-center text-slate-400 ${
                  children.length === 0 ? 'invisible' : ''
                }`}
                aria-label="하위 폴더 토글"
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

            <div className="flex items-center gap-0.5">
              {canEdit && (
                <div className="hidden items-center gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => onCreateChild(col.id)}
                    title="하위 컬렉션 추가"
                    className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(col)}
                    title="컬렉션 수정"
                    className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(col)}
                    title="컬렉션 삭제"
                    className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <span className="ml-1 text-xs text-slate-400 group-hover:hidden">{col.bookmark_count}</span>
            </div>
          </div>
          {children.length > 0 && isExpanded && renderBranch(col.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-0.5">
      {collections.length === 0 ? (
        <p className="px-2.5 py-2 text-xs text-slate-400">생성된 컬렉션이 없습니다.</p>
      ) : (
        renderBranch('__root__', 0)
      )}

      {canEdit && draggingId && (
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
            const sourceId = e.dataTransfer.getData('text/plain') || draggingId;
            setDraggingId(null);
            setDragOverId(null);
            if (sourceId) onMove(sourceId, null);
          }}
          className={`mt-2 rounded-lg border border-dashed px-2.5 py-1.5 text-center text-xs ${
            dragOverId === '__root__'
              ? 'border-sky-500 bg-sky-50 text-sky-700'
              : 'border-slate-300 text-slate-500'
          }`}
        >
          여기에 놓아 최상위 폴더로 이동
        </div>
      )}
    </div>
  );
}
