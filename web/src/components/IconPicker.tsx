import {
  Baby,
  BookOpen,
  Bookmark,
  Briefcase,
  Calendar,
  Camera,
  Car,
  Clock,
  Cloud,
  Code2,
  Coffee,
  Compass,
  CreditCard,
  Database,
  FileText,
  Film,
  Folder,
  Gamepad2,
  Gift,
  Globe,
  GraduationCap,
  Headphones,
  Heart,
  HeartPulse,
  Home,
  House,
  Layers,
  Lightbulb,
  Lock,
  MapPin,
  Music,
  Newspaper,
  Palette,
  Plane,
  Receipt,
  Rocket,
  Server,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  Terminal,
  Trophy,
  Utensils,
  Video,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface IconCatalogItem {
  id: string;
  label: string;
  keywords: string;
  Icon: LucideIcon;
}

export const COLLECTION_ICONS: IconCatalogItem[] = [
  { id: 'folder', label: '폴더', keywords: 'folder directory 폴더 디렉토리', Icon: Folder },
  { id: 'house', label: '집/홈', keywords: 'house home 집 홈 주거 가족', Icon: House },
  { id: 'home', label: '홈', keywords: 'home house 홈 집', Icon: Home },
  { id: 'bookmark', label: '북마크', keywords: 'bookmark save 북마크 저장', Icon: Bookmark },
  { id: 'star', label: '중요', keywords: 'star favorite 별 즐겨찾기', Icon: Star },
  { id: 'heart', label: '관심', keywords: 'heart love like 하트 관심 좋아요', Icon: Heart },
  { id: 'code', label: '개발', keywords: 'code dev programming 개발 코딩', Icon: Code2 },
  { id: 'terminal', label: '터미널', keywords: 'terminal cli shell 터미널 콘솔', Icon: Terminal },
  { id: 'server', label: '서버', keywords: 'server homelab nas 서버 홈서버 나스', Icon: Server },
  { id: 'database', label: '데이터', keywords: 'database db sql 데이터 디비', Icon: Database },
  { id: 'cloud', label: '클라우드', keywords: 'cloud sync 클라우드 저장소', Icon: Cloud },
  { id: 'book', label: '문서/책', keywords: 'book read docs 책 문서 독서', Icon: BookOpen },
  { id: 'file-text', label: '노트', keywords: 'file note text 문서 메모 노트', Icon: FileText },
  { id: 'newspaper', label: '뉴스', keywords: 'news article blog 뉴스 기사 블로그', Icon: Newspaper },
  { id: 'briefcase', label: '업무', keywords: 'work job office business 업무 회사 일', Icon: Briefcase },
  { id: 'receipt', label: '정산', keywords: 'receipt tax invoice bill 영수증 세금 정산 명세서', Icon: Receipt },
  { id: 'wallet', label: '지갑/금융', keywords: 'wallet finance money bank 지갑 금융 돈 은행', Icon: Wallet },
  { id: 'credit-card', label: '카드/결제', keywords: 'card payment shop 카드 결제 금융', Icon: CreditCard },
  { id: 'shopping-cart', label: '쇼핑', keywords: 'shopping cart store buy 쇼핑 장바구니 구매', Icon: ShoppingCart },
  { id: 'utensils', label: '음식/맛집', keywords: 'food restaurant cook recipe 음식 맛집 요리', Icon: Utensils },
  { id: 'coffee', label: '카페', keywords: 'coffee cafe drink 커피 카페 음료', Icon: Coffee },
  { id: 'car', label: '자동차', keywords: 'car drive auto 자동차 차량 운전', Icon: Car },
  { id: 'plane', label: '여행', keywords: 'plane travel flight trip 여행 비행기 휴가', Icon: Plane },
  { id: 'map-pin', label: '지도/장소', keywords: 'map location place 지도 위치 장소', Icon: MapPin },
  { id: 'compass', label: '탐색', keywords: 'compass explore guide 탐색 가이드', Icon: Compass },
  { id: 'gamepad', label: '게임', keywords: 'game gaming play 게임 오락', Icon: Gamepad2 },
  { id: 'music', label: '음악', keywords: 'music song audio 음악 노래', Icon: Music },
  { id: 'headphones', label: '오디오', keywords: 'headphones podcast audio 팟캐스트 오디오', Icon: Headphones },
  { id: 'film', label: '영화', keywords: 'film movie cinema 영화 드라마', Icon: Film },
  { id: 'video', label: '영상', keywords: 'video youtube stream 영상 유튜브', Icon: Video },
  { id: 'camera', label: '사진', keywords: 'camera photo image 사진 카메라 이미지', Icon: Camera },
  { id: 'palette', label: '디자인', keywords: 'design art color palette 디자인 미술 색감', Icon: Palette },
  { id: 'graduation-cap', label: '학습', keywords: 'study learn school edu 공부 학습 교육', Icon: GraduationCap },
  { id: 'lightbulb', label: '아이디어', keywords: 'idea tip bulb 아이디어 영감 팁', Icon: Lightbulb },
  { id: 'heart-pulse', label: '건강', keywords: 'health medical hospital 건강 병원 운동', Icon: HeartPulse },
  { id: 'baby', label: '육아', keywords: 'baby kids family 육아 아기 가족', Icon: Baby },
  { id: 'shield', label: '보안', keywords: 'shield security privacy 보안 안전', Icon: Shield },
  { id: 'lock', label: '잠금', keywords: 'lock password auth 잠금 비밀번호', Icon: Lock },
  { id: 'wrench', label: '도구', keywords: 'wrench tool setting fix 도구 설정 유틸', Icon: Wrench },
  { id: 'calendar', label: '일정', keywords: 'calendar schedule date 달력 일정 날짜', Icon: Calendar },
  { id: 'clock', label: '시간', keywords: 'clock time later 시간 나중에', Icon: Clock },
  { id: 'gift', label: '선물', keywords: 'gift wishlist wish 선물 위시리스트', Icon: Gift },
  { id: 'trophy', label: '목표', keywords: 'trophy goal award 목표 성과', Icon: Trophy },
  { id: 'rocket', label: '프로젝트', keywords: 'rocket launch project 프로젝트 런칭', Icon: Rocket },
  { id: 'zap', label: '빠른도구', keywords: 'zap fast automation 자동화 빠른', Icon: Zap },
  { id: 'layers', label: '아키텍처', keywords: 'layers stack 구조 스택', Icon: Layers },
  { id: 'tag', label: '분류', keywords: 'tag label 태그 분류', Icon: Tag },
  { id: 'globe', label: '웹', keywords: 'globe web internet 웹 사이트 인터넷', Icon: Globe },
  { id: 'sparkles', label: '모음', keywords: 'sparkles ai magic 추천 AI 모음', Icon: Sparkles },
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

export function iconifySvgUrl(iconifyValue: string): string | null {
  if (!iconifyValue.startsWith('iconify:')) return null;
  const raw = iconifyValue.slice('iconify:'.length);
  const parts = raw.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return `https://api.iconify.design/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}.svg`;
}

export function CollectionIcon({
  name,
  color,
  className = 'h-4 w-4',
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  const extUrl = iconifySvgUrl(name);
  if (extUrl) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`}
        style={{
          backgroundColor: color || 'currentColor',
          maskImage: `url(${extUrl})`,
          WebkitMaskImage: `url(${extUrl})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
        }}
      />
    );
  }

  const found = COLLECTION_ICONS.find((item) => item.id === name) ?? COLLECTION_ICONS[0];
  const Icon = found.Icon;
  return <Icon className={className} style={color ? { color } : undefined} />;
}
