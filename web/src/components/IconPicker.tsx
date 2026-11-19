import {
  BookOpen,
  Bookmark,
  Briefcase,
  Code2,
  Folder,
  Gamepad2,
  Globe,
  Heart,
  Home,
  Receipt,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export const COLLECTION_ICONS: Array<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'folder', label: '폴더', Icon: Folder },
  { id: 'bookmark', label: '북마크', Icon: Bookmark },
  { id: 'code', label: '개발', Icon: Code2 },
  { id: 'book', label: '문서', Icon: BookOpen },
  { id: 'briefcase', label: '업무', Icon: Briefcase },
  { id: 'receipt', label: '정산', Icon: Receipt },
  { id: 'home', label: '생활', Icon: Home },
  { id: 'gamepad', label: '게임', Icon: Gamepad2 },
  { id: 'globe', label: '웹', Icon: Globe },
  { id: 'heart', label: '관심', Icon: Heart },
  { id: 'sparkles', label: '모음', Icon: Sparkles },
];

export const COLLECTION_COLORS = [
  '#64748b',
  '#0284c7',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#e11d48',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0d9488',
];

export function CollectionIcon({
  name,
  color,
  className = 'h-4 w-4',
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  const found = COLLECTION_ICONS.find((item) => item.id === name) ?? COLLECTION_ICONS[0];
  const Icon = found.Icon;
  return <Icon className={className} style={color ? { color } : undefined} />;
}
