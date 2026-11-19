import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
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
  const [iconQuery, setIconQuery] = useState('');
  const [useExternalIcons, setUseExternalIcons] = useState(
    Boolean(editing?.icon?.startsWith('iconify:')),
  );
  const [externalIcons, setExternalIcons] = useState<string[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!useExternalIcons) return;
    const q = iconQuery.trim();
    if (q.length < 2) {
      setExternalIcons([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingExternal(true);
      fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=32`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('search failed'))))
        .then((data: { icons?: string[] }) => {
          setExternalIcons(Array.isArray(data.icons) ? data.icons : []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setExternalIcons([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingExternal(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [iconQuery, useExternalIcons]);

  const filteredLocalIcons = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    if (!q) return COLLECTION_ICONS;
    return COLLECTION_ICONS.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q),
    );
  }, [iconQuery]);

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

  const handleHexChange = (val: string) => {
    setColor(val);
  };

  const normalizedPickerColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#0284c7';

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
        color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#0284c7',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CollectionIcon name={icon} color={normalizedPickerColor} className="h-5 w-5" />
            <h2 className="text-base font-semibold text-slate-900">
              {editing ? '컬렉션 수정' : '새 컬렉션'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">아이콘</label>
              <div className="flex rounded-md bg-slate-100 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setUseExternalIcons(false)}
                  className={`rounded px-2 py-0.5 ${
                    !useExternalIcons ? 'bg-white font-medium text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  기본 아이콘
                </button>
                <button
                  type="button"
                  onClick={() => setUseExternalIcons(true)}
                  className={`rounded px-2 py-0.5 ${
                    useExternalIcons ? 'bg-white font-medium text-slate-900 shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  외부 아이콘 (Iconify)
                </button>
              </div>
            </div>

            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder={
                  useExternalIcons
                    ? '영문 키워드 2자 이상 검색 (예: house, shopping, server)'
                    : '아이콘 검색 (예: house, 집, car, 쇼핑)'
                }
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500"
              />
            </div>

            {!useExternalIcons ? (
              <div className="grid max-h-36 grid-cols-8 gap-1.5 overflow-y-auto rounded-lg border border-slate-100 p-1.5">
                {filteredLocalIcons.length === 0 ? (
                  <p className="col-span-8 py-3 text-center text-xs text-slate-400">
                    일치하는 기본 아이콘이 없습니다. 외부 아이콘(Iconify) 탭을 이용해 보세요.
                  </p>
                ) : (
                  filteredLocalIcons.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setIcon(item.id)}
                      title={`${item.label} (${item.id})`}
                      className={`flex h-9 items-center justify-center rounded-lg border ${
                        icon === item.id
                          ? 'border-sky-500 bg-sky-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <CollectionIcon
                        name={item.id}
                        color={normalizedPickerColor}
                        className="h-4 w-4"
                      />
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="grid max-h-36 grid-cols-8 gap-1.5 overflow-y-auto rounded-lg border border-slate-100 p-1.5">
                {iconQuery.trim().length < 2 ? (
                  <p className="col-span-8 py-3 text-center text-xs text-slate-400">
                    검색어를 2글자 이상 입력하면 Iconify 무료 아이콘을 검색합니다.
                  </p>
                ) : loadingExternal ? (
                  <p className="col-span-8 py-3 text-center text-xs text-slate-400">검색 중...</p>
                ) : externalIcons.length === 0 ? (
                  <p className="col-span-8 py-3 text-center text-xs text-slate-400">
                    검색 결과가 없습니다.
                  </p>
                ) : (
                  externalIcons.map((extId) => {
                    const value = `iconify:${extId}`;
                    return (
                      <button
                        key={extId}
                        type="button"
                        onClick={() => setIcon(value)}
                        title={extId}
                        className={`flex h-9 items-center justify-center rounded-lg border ${
                          icon === value
                            ? 'border-sky-500 bg-sky-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <CollectionIcon
                          name={value}
                          color={normalizedPickerColor}
                          className="h-4 w-4"
                        />
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">색상</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={normalizedPickerColor}
                onChange={(e) => setColor(e.target.value)}
                aria-label="색상 선택"
                className="h-8 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => handleHexChange(e.target.value)}
                placeholder="#0284c7"
                maxLength={7}
                className="w-24 rounded-lg border border-slate-200 px-2.5 py-1 font-mono text-xs outline-none focus:border-sky-500"
              />
              <div className="flex flex-wrap gap-1.5">
                {COLLECTION_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full border-2 ${
                      color.toLowerCase() === c ? 'scale-110 border-slate-900' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
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
