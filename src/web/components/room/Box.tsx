import { useId } from "react";
// 한 점 투시 인형의 집 상자(뒷벽 · 옆벽 · 천장 · 나무 바닥). 좌표는 viewBox 단위.
export type Geom = { W: number; H: number; bx0: number; bx1: number; by0: number; by1: number };

export const GEOM = {
  tile: { W: 150, H: 100, bx0: 30, bx1: 120, by0: 16, by1: 68 },
  phTile: { W: 240, H: 100, bx0: 36, bx1: 204, by0: 14, by1: 70 },
  // 방 상세: 가로가 조금 긴 넓은 방(6:5). 뒷벽을 넓고 얕게 해 바닥이 넓어 보이게, 왼쪽 벽은 게시판 자리
  detail: { W: 360, H: 300, bx0: 112, bx1: 296, by0: 34, by1: 184 },
} satisfies Record<string, Geom>;

export type Palette = {
  ink: string;
  frame: string;
  ceil: string;
  side: string;
  back: string;
  floor: string;
  plank: string;
  trim?: string;
  /** 벽 아래쪽 판넬(징두리) · 걸레받이 · 엇갈린 마루 널 색 */
  wain: string;
  base: string;
  floor2: string;
};

// 새 캐릭터 그림(파스텔 · 부드러운 갈색 외곽선 · 옅은 그림자)에 맞춘 색
export const PALETTE = {
  lit: { ink: "#5B4640", frame: "#F2CF96", ceil: "#FBEBD6", side: "#FCE6B2", back: "#FDF3D8", floor: "#EFCDA3", plank: "#D8AE84", wain: "#F6DDB4", base: "#C99463", floor2: "#E8C194" },
  unlit: { ink: "#2A2438", frame: "#1E2A4E", ceil: "#1F2D57", side: "#22335F", back: "#293B6C", floor: "#8A8174", plank: "#6E665B", wain: "#24365F", base: "#4A4458", floor2: "#80776B" },
  phLit: { ink: "#5B4640", frame: "#6B4A40", ceil: "#F4E7D0", side: "#FBEFCF", back: "#FCF3DC", floor: "#7B4436", plank: "#5F3128", trim: "#D9A93A", wain: "#F1E0BE", base: "#6B4A40", floor2: "#723D30" },
  phUnlit: { ink: "#2A2438", frame: "#3E2D33", ceil: "#1F2D57", side: "#22335F", back: "#293B6C", floor: "#4C3540", plank: "#3A2832", trim: "#A88A3E", wain: "#24365F", base: "#3E2D33", floor2: "#45303A" },
} satisfies Record<string, Palette>;

const pts = (a: number[][]) => a.map((p) => p.join(",")).join(" ");

/** 왼쪽 벽 위 점: x(0..bx0)에서 위(t=0)~아래(t=1) 사이 */
export function leftWallPt(g: Geom, x: number, t: number) {
  const top = (g.by0 * x) / g.bx0;
  const bottom = g.H - ((g.H - g.by1) * x) / g.bx0;
  return [x, top + (bottom - top) * t];
}

/** 바닥 위 점: 뒤(f=0, 뒷벽 밑) ~ 앞(f=1, 화면 아래) 사이, 가로 위치 a(0..1) */
export function floorPt(g: Geom, a: number, f: number) {
  const y = g.by1 + (g.H - g.by1) * f;
  const x0 = g.bx0 * (1 - f);
  const x1 = g.bx1 + (g.W - g.bx1) * f;
  return [x0 + (x1 - x0) * a, y];
}

export function Box({ g, c, sw }: { g: Geom; c: Palette; sw: number }) {
  const { W, H, bx0, bx1, by0, by1 } = g;
  const id = useId().replace(/:/g, "");
  const line = { stroke: c.ink, strokeWidth: sw, strokeLinejoin: "round" as const };
  const bh = by1 - by0;
  // 옆벽은 앞으로 올수록 H / bh 배 커진다
  const z = H / bh;
  const wh = bh * 0.26; // 징두리 높이
  const bb = bh * 0.035; // 걸레받이 높이
  const planks = 6;
  // 바닥 깊이 줄(원근: 앞쪽일수록 간격이 넓다)
  const rowsF = [0.12, 0.3, 0.55, 0.85];
  return (
    <g data-part="room-shell">
      <defs>
        <linearGradient id={`${id}bk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}sl`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c.ink} stopOpacity="0.12" />
          <stop offset="1" stopColor={c.ink} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}sr`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor={c.ink} stopOpacity="0.12" />
          <stop offset="1" stopColor={c.ink} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}fl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.ink} stopOpacity="0.16" />
          <stop offset="0.35" stopColor={c.ink} stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill={c.back} />
      {/* 천장 */}
      <polygon points={pts([[0, 0], [W, 0], [bx1, by0], [bx0, by0]])} fill={c.ceil} {...line} />
      {/* 옆벽: 벽 · 징두리 · 걸레받이 · 앞쪽으로 갈수록 옅은 그늘 */}
      <polygon points={pts([[0, 0], [bx0, by0], [bx0, by1], [0, H]])} fill={c.side} />
      <polygon points={pts([[0, H - wh * z], [bx0, by1 - wh], [bx0, by1], [0, H]])} fill={c.wain} />
      <polygon points={pts([[0, H - bb * z], [bx0, by1 - bb], [bx0, by1], [0, H]])} fill={c.base} />
      <line x1={0} y1={H - wh * z} x2={bx0} y2={by1 - wh} stroke={c.base} strokeWidth={sw * 0.9} />
      <polygon points={pts([[0, 0], [bx0, by0], [bx0, by1], [0, H]])} fill={`url(#${id}sl)`} {...line} />
      <polygon points={pts([[W, 0], [W, H], [bx1, by1], [bx1, by0]])} fill={c.side} />
      <polygon points={pts([[W, H - wh * z], [bx1, by1 - wh], [bx1, by1], [W, H]])} fill={c.wain} />
      <polygon points={pts([[W, H - bb * z], [bx1, by1 - bb], [bx1, by1], [W, H]])} fill={c.base} />
      <line x1={W} y1={H - wh * z} x2={bx1} y2={by1 - wh} stroke={c.base} strokeWidth={sw * 0.9} />
      <polygon points={pts([[W, 0], [W, H], [bx1, by1], [bx1, by0]])} fill={`url(#${id}sr)`} {...line} />
      {/* 뒷벽 */}
      <rect x={bx0} y={by0} width={bx1 - bx0} height={bh} fill={c.back} />
      <rect x={bx0} y={by1 - wh} width={bx1 - bx0} height={wh} fill={c.wain} />
      {Array.from({ length: 5 }, (_, i) => {
        const x = bx0 + ((bx1 - bx0) * (i + 1)) / 6;
        return <line key={i} x1={x} y1={by1 - wh + sw * 1.4} x2={x} y2={by1 - bb} stroke={c.base} strokeWidth={sw * 0.45} opacity="0.55" />;
      })}
      <line x1={bx0} y1={by1 - wh} x2={bx1} y2={by1 - wh} stroke={c.base} strokeWidth={sw * 0.9} />
      <rect x={bx0} y={by1 - bb} width={bx1 - bx0} height={bb} fill={c.base} />
      <rect x={bx0} y={by0} width={bx1 - bx0} height={bh} fill={`url(#${id}bk)`} {...line} />
      {/* 마루: 엇갈린 널 색 · 이음매 · 안쪽 그늘 */}
      <polygon points={pts([[bx0, by1], [bx1, by1], [W, H], [0, H]])} fill={c.floor} />
      {Array.from({ length: planks }, (_, i) =>
        i % 2 ? (
          <polygon key={i} points={pts([floorPt(g, i / planks, 0), floorPt(g, (i + 1) / planks, 0), floorPt(g, (i + 1) / planks, 1), floorPt(g, i / planks, 1)])} fill={c.floor2} />
        ) : null,
      )}
      {Array.from({ length: planks - 1 }, (_, i) => {
        const t = (i + 1) / planks;
        return <line key={i} x1={bx0 + (bx1 - bx0) * t} y1={by1} x2={W * t} y2={H} stroke={c.plank} strokeWidth={sw * 0.7} />;
      })}
      {Array.from({ length: planks }, (_, i) => {
        const f = rowsF[(i * 3) % rowsF.length];
        const [x1, y] = floorPt(g, i / planks, f);
        const [x2] = floorPt(g, (i + 1) / planks, f);
        return <line key={`s${i}`} x1={x1} y1={y} x2={x2} y2={y} stroke={c.plank} strokeWidth={sw * 0.55} />;
      })}
      <polygon points={pts([[bx0, by1], [bx1, by1], [W, H], [0, H]])} fill={`url(#${id}fl)`} {...line} />
      {c.trim && (
        <g stroke={c.trim} strokeWidth={sw * 2.2} strokeLinecap="round">
          <polyline points={pts([[0, sw], [bx0, by0], [bx1, by0], [W, sw]])} fill="none" />
          <polyline points={pts([[0, H - sw], [bx0, by1], [bx1, by1], [W, H - sw]])} fill="none" />
        </g>
      )}
    </g>
  );
}

/** 상자 테두리(맨 위에 덧그림) */
export function Frame({ g, c, sw }: { g: Geom; c: Palette; sw: number }) {
  const f = sw * 2.6;
  return (
    <g fill="none">
      <rect x={f / 2} y={f / 2} width={g.W - f} height={g.H - f} rx={f} stroke={c.frame} strokeWidth={f} />
      <rect x={f} y={f} width={g.W - 2 * f} height={g.H - 2 * f} stroke={c.ink} strokeWidth={sw * 0.8} />
      <rect x={sw / 2} y={sw / 2} width={g.W - sw} height={g.H - sw} rx={f * 1.3} stroke={c.ink} strokeWidth={sw} />
    </g>
  );
}

export function Window({ x, y, w, h, lit, sw, ink }: { x: number; y: number; w: number; h: number; lit: boolean; sw: number; ink: string }) {
  const b = w * 0.1;
  const pw = (w - 3 * b) / 2;
  const sky = lit ? "#BFE2F6" : "#3F5E98";
  const curtain = lit ? "#F6B8C4" : "#5A5C8E";
  const curtainD = lit ? "#E99AAA" : "#4B4C7C";
  const cw = w * 0.32;
  return (
    <g data-part="window">
      <rect x={x} y={y} width={w} height={h} rx={sw} fill={lit ? "#B98257" : "#6B5446"} stroke={ink} strokeWidth={sw} />
      {[x + b, x + 2 * b + pw].map((px, i) => (
        <g key={i}>
          <rect x={px} y={y + b} width={pw} height={h - 2 * b} fill={sky} stroke={ink} strokeWidth={sw * 0.6} />
          <rect x={px + sw * 0.3} y={y + b + sw * 0.3} width={pw - sw * 0.6} height={(h - 2 * b) * 0.45} fill="#fff" opacity={lit ? 0.25 : 0.06} />
        </g>
      ))}
      {lit ? (
        <g fill="#fff" opacity="0.9">
          <ellipse cx={x + b + pw * 0.55} cy={y + h * 0.3} rx={pw * 0.32} ry={h * 0.035} />
          <ellipse cx={x + 2 * b + pw * 1.45} cy={y + h * 0.48} rx={pw * 0.26} ry={h * 0.03} />
        </g>
      ) : (
        <g>
          <circle cx={x + 2 * b + pw * 1.5} cy={y + h * 0.26} r={pw * 0.24} fill="#FFF3C4" />
          <circle cx={x + b + pw * 0.4} cy={y + h * 0.45} r={sw * 0.35} fill="#fff" />
          <circle cx={x + b + pw * 0.7} cy={y + h * 0.22} r={sw * 0.3} fill="#fff" />
        </g>
      )}
      {lit && <path d={`M${x + b * 1.6} ${y + h * 0.6} l${w * 0.12} ${-h * 0.25}`} stroke="#fff" strokeWidth={sw} strokeLinecap="round" opacity="0.8" />}
      {/* 커튼 · 커튼봉 · 창턱 */}
      <path d={`M${x - cw * 0.35} ${y - sw} H${x + cw * 0.6} Q${x + cw * 0.15} ${y + h * 0.5} ${x + cw * 0.35} ${y + h + sw} H${x - cw * 0.35} Z`} fill={curtain} stroke={ink} strokeWidth={sw * 0.7} strokeLinejoin="round" />
      <path d={`M${x + w + cw * 0.35} ${y - sw} H${x + w - cw * 0.6} Q${x + w - cw * 0.15} ${y + h * 0.5} ${x + w - cw * 0.35} ${y + h + sw} H${x + w + cw * 0.35} Z`} fill={curtain} stroke={ink} strokeWidth={sw * 0.7} strokeLinejoin="round" />
      <path d={`M${x} ${y + sw} Q${x + cw * 0.1} ${y + h * 0.5} ${x + cw * 0.05} ${y + h}`} stroke={curtainD} strokeWidth={sw * 0.6} fill="none" />
      <path d={`M${x + w} ${y + sw} Q${x + w - cw * 0.1} ${y + h * 0.5} ${x + w - cw * 0.05} ${y + h}`} stroke={curtainD} strokeWidth={sw * 0.6} fill="none" />
      <rect x={x - cw * 0.5} y={y - sw * 2} width={w + cw} height={sw * 1.4} rx={sw * 0.7} fill={lit ? "#B98257" : "#6B5446"} stroke={ink} strokeWidth={sw * 0.6} />
      <rect x={x - b} y={y + h - sw * 0.2} width={w + 2 * b} height={sw * 1.8} rx={sw * 0.6} fill={lit ? "#FFF7EA" : "#7D7F9F"} stroke={ink} strokeWidth={sw * 0.6} />
    </g>
  );
}

/** 천장에 매달린 펜던트 조명 + 불빛(켜짐) */
export function Pendant({ x, top, len, u, lit, sw, ink, floorY }: { x: number; top: number; len: number; u: number; lit: boolean; sw: number; ink: string; floorY: number }) {
  const y = top + len;
  return (
    <g>
      {lit && (
        <g data-part="lamplight" fill="#FFE07A">
          <polygon points={pts([[x - 4 * u, y + 2 * u], [x + 4 * u, y + 2 * u], [x + 22 * u, floorY], [x - 22 * u, floorY]])} opacity="0.18" />
          <polygon points={pts([[x - 3 * u, y + 2 * u], [x + 3 * u, y + 2 * u], [x + 13 * u, floorY - 6 * u], [x - 13 * u, floorY - 6 * u]])} opacity="0.22" />
        </g>
      )}
      <line x1={x} y1={top} x2={x} y2={y - 3 * u} stroke={ink} strokeWidth={sw * 0.8} />
      <circle cx={x} cy={y + 1.6 * u} r={2.2 * u} fill={lit ? "#FFE58A" : "#C9C4A8"} stroke={ink} strokeWidth={sw * 0.6} />
      <path d={`M${x - 2 * u} ${y - 3.4 * u} L${x + 2 * u} ${y - 3.4 * u} L${x + 6 * u} ${y + 1 * u} L${x - 6 * u} ${y + 1 * u} Z`} fill={lit ? "#E7A86E" : "#8B8D86"} stroke={ink} strokeWidth={sw * 0.8} strokeLinejoin="round" />
    </g>
  );
}

/** 왼쪽 벽 코르크 게시판(작은 타일용) */
export function Cork({ g, sw, ink, lit }: { g: Geom; sw: number; ink: string; lit: boolean }) {
  const x1 = g.bx0 * 0.18;
  const x2 = g.bx0 * 0.8;
  const outer = [leftWallPt(g, x1, 0.3), leftWallPt(g, x2, 0.3), leftWallPt(g, x2, 0.66), leftWallPt(g, x1, 0.7)];
  const ix1 = x1 + (x2 - x1) * 0.14;
  const ix2 = x2 - (x2 - x1) * 0.12;
  const inner = [leftWallPt(g, ix1, 0.35), leftWallPt(g, ix2, 0.345), leftWallPt(g, ix2, 0.625), leftWallPt(g, ix1, 0.655)];
  const note = (x: number, t: number, col: string) => {
    const a = leftWallPt(g, x, t);
    const b = leftWallPt(g, x + (x2 - x1) * 0.22, t);
    // 메모 높이는 선 굵기에 맞춘다 (작은 방 칸 sw 0.88 → 약 4, 방 상세에서 공유 카드로 그릴 때는 그만큼 크게)
    const nh = sw * 4.5;
    return <polygon points={pts([a, b, [b[0], b[1] + nh], [a[0], a[1] + nh]])} fill={col} />;
  };
  return (
    <g data-part="cork" opacity={lit ? 1 : 0.75}>
      <polygon points={pts(outer)} fill="#9C6A45" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <polygon points={pts(inner)} fill="#C99463" stroke={ink} strokeWidth={sw * 0.5} strokeLinejoin="round" />
      {note(ix1 + 1, 0.4, "#FFF5A8")}
      {note(ix1 + (x2 - x1) * 0.38, 0.5, "#fff")}
    </g>
  );
}

/** 창문에서 바닥으로 떨어지는 달빛(꺼짐) */
export function Moonbeam({ win, floorY, spread }: { win: { x: number; y: number; w: number; h: number }; floorY: number; spread: number }) {
  const { x, y, w, h } = win;
  return (
    <g data-part="moonbeam" fill="#DCE7FF">
      <polygon points={pts([[x, y + h * 0.2], [x + w * 0.3, y + h], [x - spread * 0.4, floorY], [x - spread * 1.4, floorY]])} opacity="0.13" />
      <polygon points={pts([[x + w * 0.1, y + h * 0.3], [x + w * 0.3, y + h], [x - spread * 0.55, floorY - 2], [x - spread * 1.15, floorY - 2]])} opacity="0.12" />
    </g>
  );
}
