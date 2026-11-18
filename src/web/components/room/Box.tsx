// 한 점 투시 인형의 집 상자(뒷벽 · 옆벽 · 천장 · 나무 바닥). 좌표는 viewBox 단위.
export type Geom = { W: number; H: number; bx0: number; bx1: number; by0: number; by1: number };

export const GEOM = {
  tile: { W: 150, H: 100, bx0: 30, bx1: 120, by0: 16, by1: 68 },
  phTile: { W: 240, H: 100, bx0: 36, bx1: 204, by0: 14, by1: 70 },
  // 방 상세: 게시판을 붙일 왼쪽 벽을 넓게
  detail: { W: 300, H: 360, bx0: 120, bx1: 280, by0: 46, by1: 252 },
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
};

export const PALETTE = {
  lit: { ink: "#5B4640", frame: "#F2CF96", ceil: "#FBEBD6", side: "#FCE6B2", back: "#FDF3D8", floor: "#EFCDA3", plank: "#D8AE84" },
  unlit: { ink: "#2A2438", frame: "#1E2A4E", ceil: "#1F2D57", side: "#22335F", back: "#293B6C", floor: "#8A8174", plank: "#6E665B" },
  phLit: { ink: "#5B4640", frame: "#6B4A40", ceil: "#F4E7D0", side: "#FBEFCF", back: "#FCF3DC", floor: "#7B4436", plank: "#5F3128", trim: "#D9A93A" },
  phUnlit: { ink: "#2A2438", frame: "#3E2D33", ceil: "#1F2D57", side: "#22335F", back: "#293B6C", floor: "#4C3540", plank: "#3A2832", trim: "#A88A3E" },
} satisfies Record<string, Palette>;

const pts = (a: number[][]) => a.map((p) => p.join(",")).join(" ");

/** 왼쪽 벽 위 점: x(0..bx0)에서 위(t=0)~아래(t=1) 사이 */
export function leftWallPt(g: Geom, x: number, t: number) {
  const top = (g.by0 * x) / g.bx0;
  const bottom = g.H - ((g.H - g.by1) * x) / g.bx0;
  return [x, top + (bottom - top) * t];
}

export function Box({ g, c, sw }: { g: Geom; c: Palette; sw: number }) {
  const { W, H, bx0, bx1, by0, by1 } = g;
  const line = { stroke: c.ink, strokeWidth: sw, strokeLinejoin: "round" as const };
  const planks = 6;
  return (
    <g>
      <rect x="0" y="0" width={W} height={H} fill={c.back} />
      <polygon points={pts([[0, 0], [W, 0], [bx1, by0], [bx0, by0]])} fill={c.ceil} {...line} />
      <polygon points={pts([[0, 0], [bx0, by0], [bx0, by1], [0, H]])} fill={c.side} {...line} />
      <polygon points={pts([[W, 0], [W, H], [bx1, by1], [bx1, by0]])} fill={c.side} {...line} />
      <rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} fill={c.back} {...line} />
      <polygon points={pts([[bx0, by1], [bx1, by1], [W, H], [0, H]])} fill={c.floor} {...line} />
      {Array.from({ length: planks - 1 }, (_, i) => {
        const t = (i + 1) / planks;
        return <line key={i} x1={bx0 + (bx1 - bx0) * t} y1={by1} x2={W * t} y2={H} stroke={c.plank} strokeWidth={sw * 0.7} />;
      })}
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
  const pane = lit ? "#BFE2F6" : "#4D6FA8";
  const b = w * 0.1;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={sw} fill={lit ? "#B98257" : "#6B5446"} stroke={ink} strokeWidth={sw} />
      <rect x={x + b} y={y + b} width={(w - 3 * b) / 2} height={h - 2 * b} fill={pane} stroke={ink} strokeWidth={sw * 0.6} />
      <rect x={x + 2 * b + (w - 3 * b) / 2} y={y + b} width={(w - 3 * b) / 2} height={h - 2 * b} fill={pane} stroke={ink} strokeWidth={sw * 0.6} />
      {lit && <path d={`M${x + b * 1.6} ${y + h * 0.6} l${w * 0.12} ${-h * 0.25}`} stroke="#fff" strokeWidth={sw} strokeLinecap="round" opacity="0.8" />}
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
    return <polygon points={pts([a, b, [b[0], b[1] + 4], [a[0], a[1] + 4]])} fill={col} />;
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
