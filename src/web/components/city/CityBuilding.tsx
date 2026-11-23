import type { KeyboardEvent } from "react";
import type { CityVilla } from "../../../shared/city";
import { INK, shade } from "../ink";
import { dims, hash, shapeOf, wallColor, type WindowState } from "./layout";
import { kindLabel } from "../../../shared/villa";
import { NIGHT, Planter, Bush } from "./CityProps";

const ln = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: "round" as const };
const GOLD = "#E8B84A";
const LIT = "#FFE08A";
const DARK = "#2C3656";

/** 아파트 이름을 짧게 (표지판에 들어가게) */
export const shortName = (s: string, max = 8) => (Array.from(s).length > max ? `${Array.from(s).slice(0, max - 1).join("")}…` : s);

/** 화면 낭독기용 설명 */
export const buildingLabel = (v: CityVilla, mine: boolean) =>
  `${mine ? `우리 ${kindLabel(v.kind)}, ` : ""}${v.name}${v.kind === "apartment" ? ", 타워팰리스" : ""}, 오늘 불 켜진 방 ${v.litCount}개${v.trophy ? `, 지난주 집값 ${v.trophy}위` : ""}${v.battleWin ? ", 대결 승리" : ""}${v.recruit ? ", 입주자 모집 중" : ""}`;

const CUPS = {
  1: { fill: GOLD, dark: "#C9952A", hi: "#FCE59A" },
  2: { fill: "#CBD3DE", dark: "#8E9AAB", hi: "#F1F4F8" },
  3: { fill: "#E2A472", dark: "#A9683A", hi: "#F6D2B2" },
} as const;

/** 리그 트로피: 지붕 왼쪽 모서리에 올린 큰 컵 (금 · 은 · 동) + 번쩍임. (x, y) = 받침 아래 가운데 */
export function RoofTrophy({ x, y, rank }: { x: number; y: number; rank: 1 | 2 | 3 }) {
  const m = CUPS[rank];
  return (
    <g className="cb-trophy" data-trophy={rank} transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle cx="0" cy="-17" r="15" fill={m.hi} opacity=".22" />
      <path d="M-7 -26 C-14 -26 -14 -16 -6 -15 M7 -26 C14 -26 14 -16 6 -15" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M-9 -28 H9 Q9 -14 1.6 -11.5 V-7 H-1.6 V-11.5 Q-9 -14 -9 -28 Z" fill={m.fill} stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M-5.5 -25 Q-5.5 -17 -1.5 -14" fill="none" stroke={m.hi} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="-6.5" y="-7" width="13" height="3" rx="1" fill={m.dark} stroke={INK} strokeWidth="1" />
      <rect x="-8" y="-4" width="16" height="4.5" rx="1.2" fill="#7A5236" stroke={INK} strokeWidth="1" />
      <text x="0" y="-17" textAnchor="middle" fontSize="8" fontWeight="900" fill="#5B3B12">{rank}</text>
      <path className="cb-glint" d="M12 -30 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="#FFF6D6" />
    </g>
  );
}

/** 1:1 대결 승리 배지: 건물 앞면 오른쪽 위에 단 리본 메달. (x, y) = 메달 가운데 */
export function BattleMedal({ x, y }: { x: number; y: number }) {
  return (
    <g className="cb-medal" transform={`translate(${x} ${y})`} aria-hidden="true">
      <path d="M-6 4 L-9 17 L-5 14.5 L-2 18 L0 6 Z" fill="#E5383B" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M6 4 L9 17 L5 14.5 L2 18 L0 6 Z" fill="#C42B2E" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
      <circle r="10" fill="#FF7A59" stroke={INK} strokeWidth="1.3" />
      <circle r="7" fill="#FFE08A" stroke="#C2512F" strokeWidth="1" />
      <text x="0" y="3.4" textAnchor="middle" fontSize="9" fontWeight="900" fill="#8A2E14">승</text>
    </g>
  );
}

const FLAG = "#FF7A59";

/** 빈방 모집 깃발: 지붕 오른쪽 모서리에 세운 깃대 + "모집 중" 깃발. (x, y) = 깃대 아래 끝 */
export function RecruitFlag({ x, y }: { x: number; y: number }) {
  return (
    <g className="cb-flag" transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x="-1.4" y="-40" width="2.8" height="40" rx="1.2" fill="#E9E7F2" stroke={INK} strokeWidth="1" />
      <circle cx="0" cy="-41" r="2.6" fill={GOLD} stroke={INK} strokeWidth="1" />
      <g className="cb-flag-cloth">
        <path d="M1.4 -38 H44 L38 -29 L44 -20 H1.4 Z" fill={FLAG} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
        <text x="21" y="-25.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#fff">모집 중</text>
      </g>
    </g>
  );
}

function Window({ x, y, w, h, state, wall, arched }: { x: number; y: number; w: number; h: number; state: WindowState; wall: string; arched: boolean }) {
  const r = arched ? w / 2 : 1.5;
  const d = arched
    ? `M${x} ${y + h} V${y + r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h} Z`
    : `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} H${x} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
  if (state === "vacant") {
    // 빈 칸: 덧문이 닫힌 창
    return (
      <g className="cw vacant">
        <path d={d} fill={shade(wall, -0.16)} stroke={shade(wall, -0.4)} strokeWidth="1" />
        <path d={`M${x + w / 2} ${y + (arched ? r * 0.6 : 1)} V${y + h}`} stroke={shade(wall, -0.4)} strokeWidth=".9" />
      </g>
    );
  }
  const lit = state === "lit";
  return (
    <g className={`cw ${state}`}>
      {lit && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={w / 2} fill={LIT} opacity=".28" />}
      <path d={d} fill={lit ? LIT : DARK} stroke={INK} strokeWidth="1.1" />
      {lit && <path d={`M${x + 2.2} ${y + h - 2} V${y + (arched ? r : 2.5)}`} stroke="#FFF6D6" strokeWidth="1.4" strokeLinecap="round" />}
      <rect x={x - 1.5} y={y + h} width={w + 3} height="2.2" rx="1" fill="#FBF6EC" stroke={INK} strokeWidth=".8" />
    </g>
  );
}

type Props = {
  villa: CityVilla;
  x: number;
  y: number;
  mine: boolean;
  /** 처음 열 때 화면을 맞출 건물 (우리 아파트 중 하나). 없으면 mine 을 따른다 */
  anchor?: boolean;
  selected: boolean;
  onSelect: (v: CityVilla) => void;
};

/** 공개 아파트 한 채. (x, y) = 건물 바닥 가운데. 누르면 카드가 열린다 */
export function CityBuilding({ villa, x, y, mine, anchor = mine, selected, onSelect }: Props) {
  const seed = hash(villa.id);
  const shape = shapeOf(villa, seed);
  const apt = !!shape.apartment;
  const d = dims(shape.tall, apt);
  const wall = wallColor(villa.id);
  const W = d.w;
  const bodyTop = -(d.plinth + shape.stories * d.story);
  const roof = bodyTop - d.cornice;
  const phW = Math.round(W * (shape.tall ? 0.52 : 0.46));
  const phTop = roof - d.ph;
  // 타워팰리스 펜트하우스는 금색 돔을 얹는다 (참고 그림 apartments). 표시 · 누르는 영역은 돔 꼭대기에 맞춘다
  const top = apt ? phTop - 10 : phTop;
  const pad = shape.tall ? 9 : 10;
  const cellW = (W - pad * 2) / shape.cols;
  const winW = Math.min(shape.tall ? 11 : 14, cellW - 7);
  const winH = shape.tall ? 9 : 15;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(villa);
    }
  };

  return (
    <g
      className={`city-bldg${selected ? " selected" : ""}${mine ? " mine" : ""}`}
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={buildingLabel(villa, mine)}
      aria-pressed={selected}
      id={anchor ? "city-mine" : undefined}
      onClick={() => onSelect(villa)}
      onKeyDown={onKey}
      data-lit={villa.litCount}
      data-stories={shape.stories}
      data-recruit={villa.recruit ? "1" : undefined}
      data-trophy={villa.trophy}
      data-battle-win={villa.battleWin ? "1" : undefined}
      data-kind={apt ? "apartment" : undefined}
    >
      {/* 누르기 쉬운 넓은 영역 + 포커스 테두리 */}
      <rect className="cb-ring" x={-W / 2 - 8} y={top - 14} width={W + 16} height={-top + 20} rx="12" />
      <ellipse cx="0" cy="2" rx={W / 2 + 8} ry="5" fill="#000" opacity=".2" />

      {/* 몸통 */}
      <rect x={-W / 2} y={bodyTop} width={W} height={-bodyTop} fill={wall} {...ln} />
      {shape.tall && <rect x={-W / 2 + pad + cellW} y={bodyTop} width={cellW} height={shape.stories * d.story} fill={shade(wall, 0.25)} />}
      {Array.from({ length: shape.stories - 1 }, (_, i) => (
        <path key={i} d={`M${-W / 2 + 1} ${bodyTop + (i + 1) * d.story} H${W / 2 - 1}`} stroke={shade(wall, -0.12)} strokeWidth="1" />
      ))}
      {shape.windows.map((s, i) => {
        const r = Math.floor(i / shape.cols);
        const c = i % shape.cols;
        const wx = -W / 2 + pad + c * cellW + (cellW - winW) / 2;
        const wy = bodyTop + r * d.story + (d.story - winH) / 2 - 1;
        return <Window key={i} x={wx} y={wy} w={winW} h={winH} state={s} wall={wall} arched={!shape.tall} />;
      })}

      {/* 1층 현관 */}
      <rect x={-W / 2} y={-d.plinth} width={W} height={d.plinth} fill={shade(wall, -0.08)} {...ln} />
      <rect x={-W / 2 - 2} y={-d.plinth - 2.5} width={W + 4} height="4" rx="1.5" fill={shade(wall, 0.45)} {...ln} strokeWidth={1.1} />
      <path
        d={`M-8 0 V${-d.plinth + 12} A8 8 0 0 1 8 ${-d.plinth + 12} V0 Z`}
        fill="#34406A"
        stroke={INK}
        strokeWidth="1.3"
      />
      <path d={`M0 0 V${-d.plinth + 9}`} stroke="#5A6896" strokeWidth="1" />
      <circle cx="-10" cy={-d.plinth + 9} r="1.6" fill={LIT} />
      <circle cx="10" cy={-d.plinth + 9} r="1.6" fill={LIT} />
      <Planter x={-W / 2 + 12} y={0} />
      <Planter x={W / 2 - 12} y={0} />

      {/* 지붕 (타워팰리스는 높은 띠에 "타워팰리스" 간판) */}
      <rect x={-W / 2 - 3} y={roof} width={W + 6} height={d.cornice} rx="1.5" fill={shade(wall, 0.45)} {...ln} strokeWidth={1.2} />
      {apt && (
        <g className="cb-apt-sign" aria-hidden="true">
          <rect x="-22" y={roof + 2} width="44" height={d.cornice - 4} rx="3" fill="#3E3A6E" stroke={INK} strokeWidth="1" />
          <text x="0" y={roof + d.cornice / 2 + 3.4} textAnchor="middle" fontSize="9.5" fontWeight="800" letterSpacing="1.5" fill={LIT}>타워</text>
        </g>
      )}

      {/* 펜트하우스: 금색 테두리 + 화분 */}
      <g className="cb-ph">
        {apt && (
          <>
            <path d={`M${-phW / 2 + 4} ${phTop} Q0 ${phTop - 18} ${phW / 2 - 4} ${phTop} Z`} fill={GOLD} {...ln} strokeWidth={1.2} />
            <circle cx="0" cy={top - 1} r="2.6" fill={GOLD} stroke={INK} strokeWidth="1" />
          </>
        )}
        <rect x={-phW / 2} y={phTop} width={phW} height={d.ph} fill={shade(wall, 0.3)} {...ln} strokeWidth={1.3} />
        <rect x={-phW / 2 - 3} y={phTop - 4} width={phW + 6} height="5" rx="2" fill={GOLD} {...ln} strokeWidth={1.2} />
        <rect x={-phW / 2 + 5} y={phTop + 6} width="7" height={d.ph - 6} rx="1" fill="#34406A" stroke={INK} strokeWidth="1" />
        <rect x={phW / 2 - 14} y={phTop + 6} width="9" height="8" rx="1" fill={DARK} stroke={GOLD} strokeWidth="1.6" />
        {!villa.trophy && <Bush x={-W / 2 + 10} y={roof} s={0.85} />}
        <Bush x={W / 2 - 10} y={roof} s={0.85} />
      </g>

      {villa.trophy && <RoofTrophy x={-W / 2 + 13} y={roof} rank={villa.trophy} />}
      {villa.battleWin && <BattleMedal x={W / 2 + 4} y={bodyTop + 9} />}

      {villa.recruit && <RecruitFlag x={W / 2 - 18} y={roof} />}

      {mine && (
        <g className="cb-mine" transform={`translate(0 ${top - 12})`}>
          <rect x={apt ? -42 : -32} y="-15" width={apt ? 84 : 64} height="17" rx="8.5" fill="#2F5BEA" stroke="#fff" strokeWidth="1.5" />
          <path d="M-4 1.5 L0 6 L4 1.5 Z" fill="#2F5BEA" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M-4 1 L4 1" stroke="#2F5BEA" strokeWidth="2" />
          <text x="0" y="-3.3" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">우리 {kindLabel(villa.kind)}</text>
        </g>
      )}
    </g>
  );
}

/** 땅 아래쪽 보도에 세운 아파트 이름 표지판 */
export function NamePlate({ x, y, name, mine }: { x: number; y: number; name: string; mine: boolean }) {
  const label = shortName(name);
  const w = Math.max(44, Array.from(label).length * 10 + 16);
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <rect x={-w / 2} y="-9" width={w} height="17" rx="8.5" fill={mine ? "#EAF0FF" : "#FFFDF7"} stroke={INK} strokeWidth="1.2" />
      <text x="0" y="3.5" textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}>{label}</text>
    </g>
  );
}

export { NIGHT };
