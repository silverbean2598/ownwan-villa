import { useId, type ReactNode } from "react";
import { Avatar, POSES } from "./Avatar";
import { SpriteAvatar } from "./avatar2/SpriteAvatar";
import { spriteBox } from "./avatar2/layers";
import type { AvatarSpec } from "../../shared/avatar";
import type { Sport } from "../../shared/sports";
import { Box, Cork, Frame, Moonbeam, PALETTE, Pendant, Window } from "./room/Box";
import { Equipment } from "./room/Equipment";
import { Chandelier, PenthouseDecor } from "./room/Penthouse";
import { Furniture } from "./furniture";
import { anchorTransform, sceneGeom, slotAnchors, type Anchor } from "./furniture/layout";
import { isSlot } from "../../shared/catalog";

type Props = {
  sport: Sport;
  lit: boolean;
  avatar: AvatarSpec;
  penthouse?: boolean;
  /** tile: 빌라 단면의 작은 방 / detail: 방 상세(왼쪽 벽에 게시판) */
  variant?: "tile" | "detail";
  /** detail에서 왼쪽 벽에 붙일 게시판(HTML) */
  board?: ReactNode;
  /** 놓은 가구 */
  placements?: { slot: string; itemId: string }[];
  /** sprite: 새 그림 캐릭터(기본) / svg: 옛 리그 캐릭터 (랜딩 그림) */
  character?: "sprite" | "svg";
};

// 새 캐릭터 그림에 기구가 들어 있는 종목: 켜진 방에서는 방 기구를 그리지 않는다 (클라이밍 벽 · 필라테스 매트)
const SPRITE_HAS_EQUIP = new Set<Sport>(["climbing", "pilates"]);

// 아바타 svg 안에서 발바닥 높이 비율(서 있음 155/168). 누운 자세는 POSES[pose].floorAt
const FEET = 155 / 168;

/** 인형의 집 상자 방. 불이 켜지면 종목 자세로 운동하고, 꺼지면 달빛 아래 잠잔다. */
export function RoomScene({ sport, lit, avatar, penthouse = false, variant = "tile", board, placements = [], character = "sprite" }: Props) {
  const sprite = character === "sprite";
  const detail = variant === "detail";
  const { g, u, k: du } = sceneGeom(variant, penthouse);
  const c = penthouse ? (lit ? PALETTE.phLit : PALETTE.phUnlit) : lit ? PALETTE.lit : PALETTE.unlit;
  const sw = 1.1 * Math.max(1, u * 0.6);
  const bw = g.bx1 - g.bx0;
  const pose = lit ? sport : "sleep";

  // 캐릭터 크기와 발 위치
  const size = 42 * du;
  const fx = g.bx0 + bw * (penthouse ? (detail ? 0.34 : 0.42) : detail ? 0.45 : 0.5);
  const fy = g.by1 + (g.H - g.by1) * (detail ? 0.5 : 0.62);
  const lying = !!POSES[pose].lying;
  const lyingFloor = POSES[pose].floorAt ?? 0.7;
  const k = size / 42; // 기구 배율
  // 잘 때는 기구 옆에 선다. 클라이밍은 벽 홀드를 딛고 조금 올라가 있다.
  const ex = lit ? fx : fx - bw * 0.16;
  const cx = lit ? fx : fx + bw * 0.14;
  const lift = pose === "climbing" && !sprite ? 10 * k : 0;
  // 새 캐릭터: 그림 아래끝(발 · 매트)을 바닥 줄에, 가운데를 cx 에
  const sb = spriteBox(pose, size);
  // 누워 자는 그림은 가로로 길어, 기구와 겹치지 않게 조금 오른쪽 · 앞(관객 쪽) 바닥에 눕힌다
  const sleepX = sprite && !lit ? bw * 0.06 : 0;
  const sleepY = sprite && !lit ? (g.H - fy) * 0.3 : 0;
  const avX = sprite ? cx + sleepX - sb.w / 2 : lying ? cx - size * 1.4 * 0.5 : cx - size / 2;
  const avY = sprite ? fy + sleepY - sb.floor : (lying ? fy - size * lyingFloor : fy - size * 1.4 * FEET) - lift;
  const showEquip = !(sprite && lit && SPRITE_HAS_EQUIP.has(sport));

  const win = penthouse
    ? null
    : { x: g.bx0 + bw * 0.66, y: g.by0 + (g.by1 - g.by0) * 0.18, w: bw * 0.2, h: (g.by1 - g.by0) * 0.34 };
  // 가구: 뒤(벽 · 안쪽 바닥)는 기구보다 먼저, 앞 바닥은 캐릭터 다음에 그린다
  const anchors = slotAnchors(variant, penthouse);
  const placed = placements
    .filter((p) => isSlot(p.slot))
    .map((p) => ({ ...anchors[p.slot as keyof typeof anchors], itemId: p.itemId }))
    .sort((a, b) => a.y - b.y);
  const fid = useId().replace(/:/g, "");
  const furniture = (items: (Anchor & { itemId: string })[], filter: string) =>
    items.length > 0 && (
      <g filter={lit ? undefined : `url(#${filter})`}>
        {items.map((p) => (
          <g key={p.slot} data-slot={p.slot} transform={anchorTransform(p)}>
            <Furniture itemId={p.itemId} />
          </g>
        ))}
      </g>
    );

  const lampX = penthouse ? g.bx0 + bw * 0.4 : g.bx0 + bw * 0.42;

  return (
    <div className={`scene ${variant} s-${sport}${penthouse ? " ph-scene" : ""}`}>
      <svg className="scene-bg" viewBox={`0 0 ${g.W} ${g.H}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        {!lit && placed.length > 0 && (
          <defs>
            {/* 꺼진 방의 가구는 어둡게. 뒤 가구는 위에 어둠막이 한 번 더 덮인다 */}
            <filter id={`${fid}b`} colorInterpolationFilters="sRGB">
              <feColorMatrix values="0.7 0 0 0 0  0 0.72 0 0 0.01  0 0 0.8 0 0.04  0 0 0 1 0" />
            </filter>
            <filter id={`${fid}f`} colorInterpolationFilters="sRGB">
              <feColorMatrix values="0.504 0 0 0 0.018  0 0.518 0 0 0.036  0 0 0.576 0 0.093  0 0 0 1 0" />
            </filter>
          </defs>
        )}
        <Box g={g} c={c} sw={sw} />
        {!detail && <Cork g={g} sw={sw * 0.8} ink={c.ink} lit={lit} />}
        {win && <Window {...win} lit={lit} sw={sw * 0.8} ink={c.ink} />}
        {penthouse && <PenthouseDecor g={g} u={du} lit={lit} ink={c.ink} sw={sw} />}
        {penthouse ? (
          <Chandelier x={lampX} top={g.by0} u={du} lit={lit} ink={c.ink} />
        ) : (
          <Pendant x={lampX} top={g.by0 - 4 * u} len={10 * u} u={u} lit={lit} sw={sw} ink={c.ink} floorY={g.by1 + 6 * u} />
        )}
        {furniture(placed.filter((p) => !p.front), `${fid}b`)}
        {showEquip && (
          <g transform={`translate(${ex} ${fy}) scale(${k})`}>
            <Equipment sport={sport} lit={lit} />
          </g>
        )}
        {!lit && (
          <>
            <rect x="0" y="0" width={g.W} height={g.H} fill="#101A3A" opacity="0.28" />
            <Moonbeam
              win={win ?? { x: g.bx1 - bw * 0.3, y: g.by0, w: bw * 0.24, h: g.by1 - g.by0 }}
              floorY={g.H - 4}
              spread={bw * 0.3}
            />
          </>
        )}
        {sprite ? (
          <SpriteAvatar spec={avatar} size={size} pose={pose} x={avX} y={avY} />
        ) : (
          <g transform={`translate(${avX} ${avY})`}>
            <Avatar spec={avatar} size={size} pose={pose} />
          </g>
        )}
        {furniture(placed.filter((p) => p.front), `${fid}f`)}
        <Frame g={g} c={c} sw={sw} />
      </svg>
      {detail && <div className="wall-board">{board}</div>}
    </div>
  );
}
