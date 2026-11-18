import { DEFAULT_AVATAR } from "../../../shared/avatar";
import { Avatar } from "../Avatar";
import { RoomScene } from "../RoomScene";
import { FurnitureIcon } from "../furniture";
import { Box, Frame, PALETTE } from "../room/Box";
import { Chandelier, PenthouseDecor } from "../room/Penthouse";
import { Crown, Sparkle } from "../celebrate/props";
import { sceneGeom } from "../furniture/layout";

const ME = { skin: 0, hair: "short", shirt: 3 };

function Arrow() {
  return (
    <svg className="lp-arrow" viewBox="0 0 24 16" width="24" height="16" aria-hidden="true">
      <path d="M2 8 H19 M14 3 L20 8 L14 13" fill="none" stroke="#B9A9A2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ① 사진을 올리면 꺼진 방 → 켜진 방 */
export function LightUpArt() {
  return (
    <div className="lp-art pair" aria-hidden="true">
      <div className="lp-mini off">
        <RoomScene sport="gym" lit={false} avatar={ME} />
      </div>
      <Arrow />
      <div className="lp-mini on pulse">
        <RoomScene sport="gym" lit avatar={ME} />
      </div>
    </div>
  );
}

/** ② 포인트로 가구를 사서 방에 놓는다 */
export function FurnitureArt() {
  return (
    <div className="lp-art pair" aria-hidden="true">
      <div className="lp-shop">
        <FurnitureIcon itemId="dumbbell-rack" size={58} />
        <span className="lp-price">150P</span>
      </div>
      <Arrow />
      <div className="lp-mini on">
        <RoomScene
          sport="gym"
          lit
          avatar={ME}
          placements={[
            { slot: "floor1", itemId: "dumbbell-rack" },
            { slot: "wall1", itemId: "owunwan-frame" },
            { slot: "floor3", itemId: "plant" },
          ]}
        />
      </div>
    </div>
  );
}

/** ③ 1등은 펜트하우스: 선글라스 · 왕관을 쓴 으쓱한 캐릭터 */
export function PenthouseArt() {
  const { g, u, k } = sceneGeom("tile", true);
  const c = PALETTE.phLit;
  const sw = 1.1 * Math.max(1, u * 0.6);
  const size = 42 * k;
  const cx = g.bx0 + (g.bx1 - g.bx0) * 0.36;
  const top = g.by1 + (g.H - g.by1) * 0.62 - size * 1.4 * (155 / 168);
  return (
    <div className="lp-art" aria-hidden="true">
      <svg className="lp-ph-art" viewBox={`0 0 ${g.W} ${g.H}`}>
        <Box g={g} c={c} sw={sw} />
        <PenthouseDecor g={g} u={k} lit ink={c.ink} sw={sw} />
        <Chandelier x={g.bx0 + (g.bx1 - g.bx0) * 0.62} top={g.by0} u={k} lit ink={c.ink} />
        <g transform={`translate(${cx - size / 2} ${top})`}>
          <Avatar spec={{ ...DEFAULT_AVATAR, hair: "short", shirt: 0 }} size={size} face="cool" joints={{ armL: 150, elbL: 30, headTilt: -6 }} />
        </g>
        <g className="lp-crown" transform={`translate(${cx - 1} ${top + 4}) scale(0.62)`}>
          <Crown x={0} y={0} rot={-10} />
        </g>
        <Sparkle cx={cx - 20} cy={top + 8} r={3.6} className="lp-twinkle" />
        <Sparkle cx={cx + 22} cy={top + 18} r={2.8} className="lp-twinkle late" />
        <Frame g={g} c={c} sw={sw} />
      </svg>
    </div>
  );
}
