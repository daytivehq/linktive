import type { Collection } from '../types/bookmark';

export interface FlattenedCollection {
  collection: Collection;
  depth: number;
  indentedLabel: string;
}

/** Flattens collections in hierarchical tree order matching sidebar sorting, with └ prefixes for children. */
export function flattenCollectionsTree(collections: Collection[]): FlattenedCollection[] {
  const byParent = new Map<string, Collection[]>();
  const existingIds = new Set(collections.map((c) => c.id));

  for (const col of collections) {
    const key = col.parent_id && existingIds.has(col.parent_id) ? col.parent_id : '__root__';
    const list = byParent.get(key) ?? [];
    list.push(col);
    byParent.set(key, list);
  }
  for (const [k, list] of byParent.entries()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    byParent.set(k, list);
  }

  const out: FlattenedCollection[] = [];
  const visited = new Set<string>();
  const walk = (parentKey: string, depth: number) => {
    for (const col of byParent.get(parentKey) ?? []) {
      if (visited.has(col.id)) continue;
      visited.add(col.id);
      const pad = depth > 0 ? `${'\u00A0\u00A0'.repeat(depth - 1)}└ ` : '';
      out.push({
        collection: col,
        depth,
        indentedLabel: `${pad}${col.name}`,
      });
      walk(col.id, depth + 1);
    }
  };
  walk('__root__', 0);
  return out;
}
