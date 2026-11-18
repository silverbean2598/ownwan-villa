import type { ReactNode } from "react";
import { Avatar, POSES } from "./Avatar";
import type { AvatarSpec } from "../../shared/avatar";
import type { Sport } from "../../shared/sports";
import { Box, Cork, Frame, GEOM, Moonbeam, PALETTE, Pendant, Window } from "./room/Box";
import { Equipment } from "./room/Equipment";
import { Chandelier, PenthouseDecor } from "./room/Penthouse";

type Props = {
  sport: Sport;
  lit: boolean;
  avatar: AvatarSpec;
  penthouse?: boolean;
  /** tile: 빌라 단면의 작은 방 / detail: 방 상세(왼쪽 벽에 게시판) */
  variant?: "tile" | "detail";
  /** detail에서 왼쪽 벽에 붙일 게시판(HTML) */
  board?: ReactNode;
};

// 아바타 svg 안에서 발바닥 높이 비율(서 있음 155/168). 누운 자세는 POSES[pose].floorAt
const FEET = 155 / 168;

/** 인형의 집 상자 방. 불이 켜지면 종목 자세로 운동하고, 꺼지면 달빛 아래 잠잔다. */
export function RoomScene({ sport, lit, avatar, penthouse = false, variant = "tile", board }: Props) {
  const detail = variant === "detail";
  const g = detail ? GEOM.detail : penthouse ? GEOM.phTile : GEOM.tile;
  const c = penthouse ? (lit ? PALETTE.phLit : PALETTE.phUnlit) : lit ? PALETTE.lit : PALETTE.unlit;
  const u = (g.by1 - g.by0) / 54;
  const sw = 1.1 * Math.max(1, u * 0.6);
  const bw = g.bx1 - g.bx0;
  const pose = lit ? sport : "sleep";

  // 캐릭터 크기와 발 위치
  // 상세 화면은 상자가 크므로 캐릭터를 상대적으로 작게(뒷벽 높이의 약 0.7배)
  const du = u * (detail ? 0.62 : 1); // 캐릭터 · 가구 배율
  const size = 42 * du;
  const fx = g.bx0 + bw * (penthouse ? (detail ? 0.34 : 0.42) : detail ? 0.45 : 0.5);
  const fy = g.by1 + (g.H - g.by1) * (detail ? 0.5 : 0.62);
  const lying = !!POSES[pose].lying;
  const lyingFloor = POSES[pose].floorAt ?? 0.7;
  const k = size / 42; // 기구 배율
  // 잘 때는 기구 옆에 선다. 클라이밍은 벽 홀드를 딛고 조금 올라가 있다.
  const ex = lit ? fx : fx - bw * 0.16;
  const cx = lit ? fx : fx + bw * 0.14;
  const lift = pose === "climbing" ? 10 * k : 0;
  const avX = lying ? cx - size * 1.4 * 0.5 : cx - size / 2;
  const avY = (lying ? fy - size * lyingFloor : fy - size * 1.4 * FEET) - lift;

  const win = penthouse
    ? null
    : { x: g.bx0 + bw * 0.66, y: g.by0 + (g.by1 - g.by0) * 0.18, w: bw * 0.2, h: (g.by1 - g.by0) * 0.34 };
  const lampX = penthouse ? g.bx0 + bw * 0.4 : g.bx0 + bw * 0.42;

  return (
    <div className={`scene ${variant} s-${sport}${penthouse ? " ph-scene" : ""}`}>
      <svg className="scene-bg" viewBox={`0 0 ${g.W} ${g.H}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <Box g={g} c={c} sw={sw} />
        {!detail && <Cork g={g} sw={sw * 0.8} ink={c.ink} lit={lit} />}
        {win && <Window {...win} lit={lit} sw={sw * 0.8} ink={c.ink} />}
        {penthouse && <PenthouseDecor g={g} u={du} lit={lit} ink={c.ink} sw={sw} />}
        {penthouse ? (
          <Chandelier x={lampX} top={g.by0} u={du} lit={lit} ink={c.ink} />
        ) : (
          <Pendant x={lampX} top={g.by0 - 4 * u} len={10 * u} u={u} lit={lit} sw={sw} ink={c.ink} floorY={g.by1 + 6 * u} />
        )}
        <g transform={`translate(${ex} ${fy}) scale(${k})`}>
          <Equipment sport={sport} lit={lit} />
        </g>
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
        <g transform={`translate(${avX} ${avY})`}>
          <Avatar spec={avatar} size={size} pose={pose} />
        </g>
        <Frame g={g} c={c} sw={sw} />
      </svg>
      {detail && <div className="wall-board">{board}</div>}
    </div>
  );
}
