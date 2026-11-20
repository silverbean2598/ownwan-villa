import { formatChange, formatPrice } from "../../../shared/rules/price";
import type { Trophy } from "../../../shared/price";
import { INK } from "../ink";
import "./price.css";

/** 집값 + 전날 대비 (오르면 빨강 ▲, 내리면 파랑 ▼ — 한국 주식 표기). 아직 집계 전이면 "집계 전" */
export function PriceTag({ price, change, className = "" }: { price: number | null | undefined; change?: number | null; className?: string }) {
  if (price === null || price === undefined) return <span className={`price-tag none ${className}`}>집계 전</span>;
  const c = formatChange(change);
  const dir = !change ? "flat" : change > 0 ? "up" : "down";
  return (
    <span className={`price-tag ${className}`}>
      <b>{formatPrice(price)}</b>
      {c && <em className={dir}>{c}</em>}
    </span>
  );
}

export const TROPHY_LABEL: Record<Trophy, string> = { 1: "금 트로피", 2: "은 트로피", 3: "동 트로피" };
const CUP: Record<Trophy, { fill: string; dark: string }> = {
  1: { fill: "#F6C445", dark: "#D9A12A" },
  2: { fill: "#CBD3DE", dark: "#9AA6B6" },
  3: { fill: "#E2A472", dark: "#B97847" },
};

/** 작은 컵 아이콘 (순위 · 카드). 리그 1 · 2 · 3위 */
export function TrophyIcon({ rank, size = 18 }: { rank: Trophy; size?: number }) {
  const m = CUP[rank];
  return (
    <svg className="trophy-icon" width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={TROPHY_LABEL[rank]}>
      <path d="M5 4 C1.5 4 1.5 9 5.5 9.5 M15 4 C18.5 4 18.5 9 14.5 9.5" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.5 3 H15.5 Q15.5 10.5 11 11.6 V14 H9 V11.6 Q4.5 10.5 4.5 3 Z" fill={m.fill} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M7 5 Q7 8.5 9 10" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".7" />
      <rect x="6" y="14" width="8" height="3.6" rx="1" fill={m.dark} stroke={INK} strokeWidth="1.1" />
    </svg>
  );
}

/** 배지 줄: 트로피 · 대결 승리 · 대결 중 */
export function PriceBadges({ trophy, battleWin, inBattle }: { trophy?: Trophy; battleWin?: boolean; inBattle?: boolean }) {
  if (!trophy && !battleWin && !inBattle) return null;
  return (
    <span className="price-badges">
      {trophy && (
        <span className={`pbadge trophy t${trophy}`}>
          <TrophyIcon rank={trophy} size={14} />
          지난주 {trophy}위
        </span>
      )}
      {battleWin && <span className="pbadge win">대결 승리</span>}
      {inBattle && <span className="pbadge fight">대결 중</span>}
    </span>
  );
}
