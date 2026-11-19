import { useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { Collection } from '../types/bookmark';
import { COLLECTION_COLORS, COLLECTION_ICONS, CollectionIcon } from './IconPicker';

interface CollectionModalProps {
  collections: Collection[];
  editing: Collection | null;
  initialParentId: string | null;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    name: string;
    description: string;
    parent_id: string | null;
    icon: string;
    color: string;
  }) => Promise<void>;
}

export function CollectionModal({
  collections,
  editing,
  initialParentId,
  onClose,
  onSave,
}: CollectionModalProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [parentId, setParentId] = useState<string>(editing?.parent_id ?? initialParentId ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? 'folder');
  const [color, setColor] = useState(editing?.color ?? '#0284c7');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Prevent selecting self or descendants as parent.
  const excludedIds = useMemo(() => {
    const blocked = new Set<string>();
    if (!editing) return blocked;
    blocked.add(editing.id);
    let added = true;
    while (added) {
      added = false;
      for (const c of collections) {
        if (c.parent_id && blocked.has(c.parent_id) && !blocked.has(c.id)) {
          blocked.add(c.id);
          added = true;
        }
      }
    }
    return blocked;
  }, [collections, editing]);

  const parentOptions = useMemo(
    () =>
      collections
        .filter((c) => !excludedIds.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [collections, excludedIds],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave({
        id: editing?.id,
        name: name.trim(),
        description: description.trim(),
        parent_id: parentId || null,
        icon,
        color,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {editing ? '컬렉션 수정' : '새 컬렉션'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">이름</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 개발 자료"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">상위 컬렉션</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
            >
              <option value="">없음 (최상위)</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">설명</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="컬렉션 진입 시 상단에 표시됩니다."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">아이콘</label>
            <div className="flex flex-wrap gap-1.5">
              {COLLECTION_ICONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIcon(item.id)}
                  title={item.label}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                    icon === item.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <CollectionIcon name={item.id} color={color} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">색상</label>
            <div className="flex flex-wrap gap-2">
              {COLLECTION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${
                    color === c ? 'border-slate-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
