import type { AvatarSpec } from "../../../shared/avatar";
import type { Sport } from "../../../shared/sports";
import { RoomScene } from "../RoomScene";

type Resident = { sport: Sport; avatar: AvatarSpec; lit: boolean; items?: { slot: string; itemId: string }[] };

// 운동 종목 · 머리 · 셔츠 · 피부색을 골고루 섞은 예시 입주민
const PH: Resident = {
  sport: "gym",
  lit: true,
  avatar: { skin: 1, hair: "bun", shirt: 0 },
};
const FLOORS: { floor: number; rooms: [Resident, Resident] }[] = [
  {
    floor: 3,
    rooms: [
      { sport: "climbing", lit: true, avatar: { skin: 0, hair: "long", shirt: 3 }, items: [{ slot: "floor3", itemId: "crash-pad" }] },
      { sport: "taekwondo", lit: true, avatar: { skin: 2, hair: "buzz", shirt: 7 } },
    ],
  },
  {
    floor: 2,
    rooms: [
      { sport: "pilates", lit: true, avatar: { skin: 0, hair: "bun", shirt: 6 }, items: [{ slot: "floor1", itemId: "plant" }] },
      { sport: "running", lit: false, avatar: { skin: 1, hair: "short", shirt: 5 } },
    ],
  },
  {
    floor: 1,
    rooms: [
      { sport: "running", lit: true, avatar: { skin: 3, hair: "short", shirt: 1 }, items: [{ slot: "wall2", itemId: "medal-frame" }] },
      { sport: "jiujitsu", lit: true, avatar: { skin: 0, hair: "long", shirt: 4 } },
    ],
  },
];

function Room({ r, penthouse = false }: { r: Resident; penthouse?: boolean }) {
  return (
    <div className={`lp-room${r.lit ? " on" : " off"}${penthouse ? " ph" : ""}`}>
      <RoomScene sport={r.sport} lit={r.lit} avatar={r.avatar} penthouse={penthouse} placements={r.items} />
    </div>
  );
}

/** 첫 화면의 작은 빌라 단면: 펜트하우스 + 3개 층, 불 켜진 방에서 운동하고 꺼진 방에서 잠잔다 */
export function HeroVilla() {
  return (
    <figure className="lp-villa" role="img" aria-label="친구들이 각자 방에서 운동하는 빌라 단면 그림. 한 방은 불이 꺼져 있고 친구가 자고 있어요.">
      <div className="lp-roof" aria-hidden="true">
        <span className="lp-flag" />
      </div>
      <div className="lp-tower" aria-hidden="true">
        <div className="lp-row lp-ph-row">
          <span className="lp-fl gold">PH</span>
          <Room r={PH} penthouse />
        </div>
        {FLOORS.map((f) => (
          <div className="lp-row" key={f.floor}>
            <span className="lp-fl">{f.floor}F</span>
            <Room r={f.rooms[0]} />
            <Room r={f.rooms[1]} />
          </div>
        ))}
        <div className="lp-entry">
          <span className="lp-door" />
        </div>
      </div>
      <div className="lp-ground" aria-hidden="true" />
    </figure>
  );
}
