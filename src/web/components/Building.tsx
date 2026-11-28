import type { AvatarSpec } from "../../shared/avatar";
import type { Sport } from "../../shared/sports";
import { VILLA_CAPACITY, kindLabel, type VillaKind } from "../../shared/villa";
import { RoomTile } from "./RoomTile";
import "./villa.css";

export type Member = {
  userId: string;
  nickname: string;
  sport: Sport;
  avatar: AvatarSpec;
  floor: number;
  floorUpToday?: boolean;
  /** 이 아파트 층을 정하는 연속 기록 (이 아파트에 올린 날로 센다) */
  streak: number;
  /** 어느 아파트든 올린 날로 센 연속 기록 (프로필) */
  userStreak?: number;
  /** 오늘 이 아파트에 올렸다 = 이 아파트에서 불이 켜졌다 */
  certifiedToday: boolean;
  /** 오늘 어느 아파트든 올렸다 */
  certifiedAnywhere?: boolean;
  placements: { slot: string; itemId: string }[];
  /** 켜 둔 방 테마(프리미엄). 없으면 null */
  theme?: string | null;
};

const PER_ROW = 3;

export type FloorRow = { floor: number | "PH"; members: Member[]; emptySlots?: number; vacantMore?: number; cont?: boolean };
export type GapRow = { gap: [number, number] };
export type Row = FloorRow | GapRow;

/**
 * 위(펜트하우스)에서 아래(1층) 순서의 행. 빈 층 구간은 하나로 접고, 한 행에는 최대 3명.
 * capacity: 이 건물의 정원 (아파트 20 · 타워팰리스 50). 빈방 수 = 정원 − 입주민
 */
export function layoutFloors(members: Member[], penthouseUserId: string | null, capacity = VILLA_CAPACITY): Row[] {
  const rows: Row[] = [];
  const ph = penthouseUserId ? members.find((m) => m.userId === penthouseUserId) : undefined;
  if (ph) rows.push({ floor: "PH", members: [ph] });

  const byFloor = new Map<number, Member[]>();
  for (const m of members) {
    if (m === ph) continue;
    byFloor.set(m.floor, [...(byFloor.get(m.floor) ?? []), m]);
  }
  byFloor.set(1, byFloor.get(1) ?? []);
  const floors = [...byFloor.keys()].sort((a, b) => b - a);

  floors.forEach((f, i) => {
    const prev = floors[i - 1];
    if (prev !== undefined && prev - 1 > f) rows.push({ gap: [f + 1, prev - 1] });
    const list = [...byFloor.get(f)!].sort((a, b) => b.streak - a.streak);
    const chunks: Member[][] = [];
    for (let k = 0; k < list.length; k += PER_ROW) chunks.push(list.slice(k, k + PER_ROW));
    if (!chunks.length) chunks.push([]);
    chunks.forEach((c, k) => {
      const row: FloorRow = { floor: f, members: c };
      if (k > 0) row.cont = true;
      if (f === 1 && k === chunks.length - 1) {
        // 빈방은 최대 한 줄만 그린다: 마지막 줄의 남은 칸, 줄이 꽉 찼으면 새 한 줄. 나머지는 "빈방 n개"로 접는다.
        const vacant = Math.max(0, capacity - members.length);
        const room = c.length === PER_ROW ? PER_ROW : PER_ROW - c.length;
        row.emptySlots = Math.min(vacant, room);
        if (vacant > row.emptySlots) row.vacantMore = vacant - row.emptySlots;
      }
      rows.push(row);
    });
  });
  return rows;
}

function VacantRoom() {
  return (
    <div className="room empty" aria-label="빈방">
      <strong>빈방</strong>
    </div>
  );
}

type Props = {
  members: Member[]; penthouseUserId: string | null; ownerId: string; meId: string; villaId?: string;
  /** 정원 · 종류 (타워팰리스면 지붕에 "타워팰리스" 간판). 없으면 아파트 · 20명 */
  capacity?: number; kind?: VillaKind;
};

export function Building({ members, penthouseUserId, ownerId, meId, villaId, capacity = VILLA_CAPACITY, kind = "villa" }: Props) {
  const rows = layoutFloors(members, penthouseUserId, capacity);
  const apt = kind === "apartment";
  const tile = (m: Member, penthouse = false) => (
    <RoomTile key={m.userId} member={m} isMe={m.userId === meId} isOwner={m.userId === ownerId} penthouse={penthouse} villaId={villaId} />
  );
  return (
    <section className={`bldg${apt ? " apt" : ""}`} aria-label={`${kindLabel(kind)} 단면`}>
      <div className="tower">
        <div className="roof">{apt && <span className="roof-sign">타워팰리스</span>}</div>
        {rows.map((r, i) => {
          if ("gap" in r) {
            const [lo, hi] = r.gap;
            return (
              <div className="gap" key={`g${i}`}>
                {lo === hi ? `${lo}F` : `${lo}–${hi}F`} · 비어 있음
              </div>
            );
          }
          if (r.floor === "PH") {
            return (
              <div className="ph" key="ph">
                <div className="ph-label">PENTHOUSE</div>
                {r.members.map((m) => tile(m, true))}
              </div>
            );
          }
          // 1층 행: 빈방을 남은 칸부터 채우고, 넘치면 다음 행으로
          const cells: JSX.Element[] = r.members.map((m) => tile(m));
          const vacants = Array.from({ length: r.emptySlots ?? 0 }, (_, k) => <VacantRoom key={`v${k}`} />);
          const all = [...cells, ...vacants];
          const chunks: JSX.Element[][] = [];
          for (let k = 0; k < all.length; k += PER_ROW) chunks.push(all.slice(k, k + PER_ROW));
          if (!chunks.length) chunks.push([]);
          return chunks.map((c, k) => (
            <div className="floor" key={`f${r.floor}-${i}-${k}`}>
              <div className="fl">{!r.cont && k === 0 ? `${r.floor}F` : ""}</div>
              {c}
              {Array.from({ length: PER_ROW - c.length }, (_, w) => (
                <div className="wall" key={`w${w}`} />
              ))}
            </div>
          )).concat(
            r.vacantMore
              ? [<div className="vacant-more" key={`vm${i}`}>빈방 {r.vacantMore}개</div>]
              : [],
          );
        })}
        <div className="entry">
          <div className="door" />
        </div>
        <div className="ground" />
      </div>
    </section>
  );
}
