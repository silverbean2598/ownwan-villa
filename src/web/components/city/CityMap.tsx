import type { CityVilla } from "../../../shared/city";
import { INK } from "../avatar/ink";
import { CityBuilding, NamePlate } from "./CityBuilding";
import { Bench, Bush, BusStop, Cloud, Lamp, Moon, NIGHT, Star, Store, Tree, Vending } from "./CityProps";
import { buildingHeight, hash, layoutCity, MARGIN, ROAD, shapeOf, SKY_H, type Lot } from "./layout";
import "./city.css";

type Props = {
  villas: CityVilla[];
  cols: number;
  /** 우리 빌라 (예전 이름, 한 곳) */
  mineId?: string | null;
  /** 우리 빌라 모두 (빌라 여러 곳에 살 때). 모두 "우리 빌라"로 표시하고, 첫 번째에 화면을 맞춘다 */
  mineIds?: string[];
  selectedId: string | null;
  onSelect: (v: CityVilla) => void;
};

/** 하늘: 별 · 달 · 구름 · 겹친 언덕 · 강 */
function Sky({ width }: { width: number }) {
  const stars = Array.from({ length: Math.round(width / 12) }, (_, i) => {
    const h = hash(`star${i}`);
    return { x: (h % 1000) / 1000 * width, y: 10 + ((h >>> 10) % 1000) / 1000 * 120, s: 0.6 + ((h >>> 20) % 10) / 14, i };
  }).filter((s) => Math.hypot(s.x - width * 0.74, s.y - 52) > 36); // 달 위에는 별을 두지 않는다
  const w = width;
  const hillBack = `M0 150 C${w * 0.12} 118 ${w * 0.22} 112 ${w * 0.36} 140 C${w * 0.5} 120 ${w * 0.6} 110 ${w * 0.72} 136 C${w * 0.84} 112 ${w * 0.94} 118 ${w} 132 V200 H0 Z`;
  const hillMid = `M0 132 C${w * 0.1} 112 ${w * 0.2} 118 ${w * 0.3} 160 L${w * 0.7} 160 C${w * 0.8} 118 ${w * 0.9} 108 ${w} 124 V200 H0 Z`;
  const bushes = Array.from({ length: Math.ceil(w / 22) + 1 }, (_, i) => i * 22);
  return (
    <g aria-hidden="true">
      <rect x="0" y="0" width={w} height={SKY_H} fill="url(#city-sky)" />
      {stars.map((s) => <Star key={s.i} x={s.x} y={s.y} s={s.s} i={s.i} />)}
      <Moon x={w * 0.74} y={52} r={20} />
      <Cloud x={w * 0.18} y={58} s={1.1} />
      <Cloud x={w * 0.55} y={104} s={0.8} />
      <Cloud x={w * 0.92} y={86} s={0.9} />
      <path d={hillBack} fill="#2C4A7E" stroke="#22365F" strokeWidth="1.2" />
      <path d={hillMid} fill="#3B6A6A" stroke="#2A4C52" strokeWidth="1.2" />
      <path d={`M0 170 C${w * 0.3} 156 ${w * 0.7} 156 ${w} 166 V200 H0 Z`} fill="#3F6E5C" />
      {bushes.map((bx, i) => <Bush key={i} x={bx} y={192 - (i % 2) * 2} s={1.1 + (i % 3) * 0.15} />)}
      {/* 강 */}
      <rect x="0" y="192" width={w} height={SKY_H - 192} fill={NIGHT.river} />
      {[0, 1, 2].map((k) => (
        <path
          key={k}
          d={Array.from({ length: Math.ceil(w / 60) }, (_, i) => `M${i * 60 + k * 20 + 6} ${204 + k * 13} h14`).join(" ")}
          stroke="#7FA2D8"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity=".55"
        />
      ))}
      {/* 강둑 */}
      <rect x="0" y={SKY_H - 6} width={w} height="6" fill={NIGHT.walk} />
    </g>
  );
}

/** 땅 한 칸: 둥근 보도 + 잔디 */
function LotBase({ lot }: { lot: Lot }) {
  return (
    <g aria-hidden="true">
      <rect x={lot.x} y={lot.y} width={lot.w} height={lot.h} rx="16" fill={NIGHT.walk} stroke="#7C7997" strokeWidth="1" />
      <rect x={lot.x + 6} y={lot.y + 6} width={lot.w - 12} height={lot.h - 18} rx="12" fill={NIGHT.grass} />
      <path
        d={`M${lot.x + 18} ${lot.y + 14} h${lot.w * 0.3}`}
        stroke={NIGHT.grassHi}
        strokeWidth="3"
        strokeLinecap="round"
        opacity=".7"
      />
    </g>
  );
}

/** 키 큰 건물 옆 줄처럼 땅 위쪽이 비면 나무 · 덤불로 채운다 (top ~ bottom 사이) */
function Filler({ lot, bottom }: { lot: Lot; bottom: number }) {
  const items: JSX.Element[] = [];
  let k = 0;
  for (let y = lot.y + 46; y <= bottom; y += 44, k++) {
    const h = hash(`f${lot.index}-${k}`);
    const xs = k % 2 ? [0.3, 0.72] : [0.18, 0.52, 0.84];
    xs.forEach((fx, i) => {
      const x = lot.x + lot.w * fx + ((h >>> (i * 4)) % 9) - 4;
      items.push((h >>> (i * 3)) % 5 === 0 ? <Bush key={`${k}-${i}`} x={x} y={y - 8} s={1.2} /> : <Tree key={`${k}-${i}`} x={x} y={y} s={0.9 + ((h >>> i) % 4) * 0.08} />);
    });
  }
  return <g aria-hidden="true">{items}</g>;
}

/** 빈 땅의 소품 묶음 */
function LotProps({ lot }: { lot: Lot }) {
  const cx = lot.x + lot.w / 2;
  const by = lot.y + lot.h - 18;
  return (
    <g>
      <Filler lot={lot} bottom={by - 150} />
      <PropSet lot={lot} cx={cx} by={by} />
    </g>
  );
}

function PropSet({ lot, cx, by }: { lot: Lot; cx: number; by: number }) {
  switch (lot.prop) {
    case "store":
      return (
        <g aria-hidden="true">
          <Store x={cx - 10} y={by - 10} />
          <Vending x={cx + 38} y={by - 10} />
          <Lamp x={lot.x + 14} y={by} />
          <Tree x={lot.x + 30} y={by - 70} s={0.85} />
          <Tree x={lot.x + lot.w - 28} y={by - 64} s={0.9} />
        </g>
      );
    case "busstop":
      return (
        <g aria-hidden="true">
          <BusStop x={cx} y={by - 6} />
          <Tree x={lot.x + 26} y={by - 50} />
          <Tree x={lot.x + lot.w - 30} y={by - 82} s={0.9} />
          <Lamp x={lot.x + lot.w - 14} y={by} />
          <Bench x={lot.x + 50} y={by - 92} />
        </g>
      );
    case "garden":
      return (
        <g aria-hidden="true">
          <ellipse cx={cx} cy={by - 50} rx="40" ry="18" fill="#3F6B48" stroke="#355C3D" strokeWidth="1.2" />
          {[-24, -8, 8, 24].map((dx, i) => (
            <circle key={dx} cx={cx + dx} cy={by - 50 + (i % 2 ? 4 : -4)} r="3" fill={["#F2B7C6", "#FFE08A", "#C9B6EE", "#F6CDB6"][i]} stroke={INK} strokeWidth=".8" />
          ))}
          <Tree x={lot.x + 28} y={by - 6} s={1.05} />
          <Tree x={lot.x + lot.w - 30} y={by - 8} />
          <Bench x={cx} y={by - 8} />
          <Lamp x={cx - 30} y={by - 2} />
          <Lamp x={cx + 30} y={by - 2} />
          <Tree x={cx} y={lot.y + 52} s={0.8} />
        </g>
      );
    default:
      return (
        <g aria-hidden="true">
          <path d={`M${lot.x + 20} ${by - 30} Q${cx} ${by - 70} ${lot.x + lot.w - 20} ${by - 40}`} fill="none" stroke="#B9B4C9" strokeWidth="7" strokeLinecap="round" opacity=".55" />
          <Tree x={lot.x + 32} y={by - 64} s={1.1} />
          <Tree x={cx + 6} y={by - 2} s={1.15} />
          <Tree x={lot.x + lot.w - 30} y={by - 70} />
          <Bench x={lot.x + 40} y={by - 6} />
          <Lamp x={lot.x + lot.w - 18} y={by - 2} />
          <Bush x={cx - 10} y={lot.y + 40} />
        </g>
      );
  }
}

/** 공개 빌라들이 모인 밤 도시. 땅은 격자, 사이에 길 · 횡단보도 · 가로등 */
export function CityMap({ villas, cols, mineId = null, mineIds, selectedId, onSelect }: Props) {
  const L = layoutCity(villas, cols);
  const mine = new Set(mineIds ?? (mineId ? [mineId] : []));
  // 처음 열 때 화면을 맞출 우리 빌라 하나 (#city-mine)
  const anchor = (mineIds ?? (mineId ? [mineId] : [])).find((id) => villas.some((v) => v.id === id)) ?? null;
  const { width, height } = L;
  const vRoads = Array.from({ length: cols - 1 }, (_, c) => MARGIN + (c + 1) * 170 + c * ROAD);
  const hRoads = [SKY_H, ...L.rowsY.map((r) => r.y + r.h)];
  return (
    <svg className="city-map" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="도시 지도">
      <defs>
        <linearGradient id="city-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16214A" />
          <stop offset="1" stopColor={NIGHT.skyLow} />
        </linearGradient>
      </defs>
      {/* 길 바탕 */}
      <rect x="0" y={SKY_H} width={width} height={height - SKY_H} fill={NIGHT.road} />
      <Sky width={width} />
      <g aria-hidden="true">
        {hRoads.map((y, i) => (
          <path key={`h${i}`} d={`M8 ${y + ROAD / 2} H${width - 8}`} stroke={NIGHT.roadLine} strokeWidth="1.6" strokeDasharray="9 9" opacity=".7" />
        ))}
        {vRoads.map((x) =>
          L.rowsY.map((r, i) => (
            <path key={`v${x}-${i}`} d={`M${x + ROAD / 2} ${r.y + 6} V${r.y + r.h - 6}`} stroke={NIGHT.roadLine} strokeWidth="1.6" strokeDasharray="9 9" opacity=".7" />
          )),
        )}
        {/* 횡단보도: 교차로 양옆 */}
        {vRoads.map((x) =>
          hRoads.slice(1, -1).map((y, i) => (
            <g key={`z${x}-${i}`} fill="#E9E7F2" opacity=".85">
              {[0, 1, 2, 3].map((k) => (
                <rect key={`a${k}`} x={x + 4 + k * 5.5} y={y - 9} width="3" height="8" rx="1" />
              ))}
              {[0, 1, 2, 3].map((k) => (
                <rect key={`b${k}`} x={x + 4 + k * 5.5} y={y + ROAD + 1} width="3" height="8" rx="1" />
              ))}
            </g>
          )),
        )}
      </g>
      {L.lots.map((lot) => (
        <LotBase key={`b${lot.index}`} lot={lot} />
      ))}
      {L.lots.map((lot) =>
        lot.villa ? (
          <g key={lot.villa.id}>
            <Filler lot={lot} bottom={lot.y + lot.h - 30 - buildingHeight(shapeOf(lot.villa)) - 30} />
            <Tree x={lot.x + lot.w - 20} y={lot.y + lot.h - 22} s={0.9} />
            <Lamp x={lot.x + 14} y={lot.y + lot.h - 18} />
            <CityBuilding
              villa={lot.villa}
              x={lot.x + lot.w / 2 - 6}
              y={lot.y + lot.h - 30}
              mine={mine.has(lot.villa.id)}
              anchor={lot.villa.id === anchor}
              selected={lot.villa.id === selectedId}
              onSelect={onSelect}
            />
            <NamePlate x={lot.x + lot.w / 2} y={lot.y + lot.h - 13} name={lot.villa.name} mine={mine.has(lot.villa.id)} />
          </g>
        ) : (
          <LotProps key={`p${lot.index}`} lot={lot} />
        ),
      )}
    </svg>
  );
}
