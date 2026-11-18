// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Building, layoutFloors, type Member } from "./Building";
import { RoomTile } from "./RoomTile";
import { VILLA_CAPACITY } from "../../shared/villa";
import { DEFAULT_AVATAR } from "../../shared/avatar";

const m = (userId: string, floor: number, streak = 0, certifiedToday = false): Member => ({
  userId,
  nickname: userId,
  sport: "gym",
  avatar: DEFAULT_AVATAR,
  floor,
  streak,
  certifiedToday,
  placements: [],
});

describe("layoutFloors", () => {
  it("penthouse_once_floors_descending_gap_collapsed_floor1_vacancies", () => {
    const members = [m("a", 12, 50), m("b", 8), m("c", 5), m("d", 1), m("e", 12, 10)];
    const rows = layoutFloors(members, "a");
    expect(rows.map((r) => ("gap" in r ? r.gap : r.floor))).toEqual(["PH", 12, [9, 11], 8, [6, 7], 5, [2, 4], 1]);
    const ph = rows[0] as { members: Member[] };
    expect(ph.members.map((x) => x.userId)).toEqual(["a"]);
    // 펜트하우스 주인은 12층 행에 또 나오지 않는다
    const f12 = rows[1] as { members: Member[] };
    expect(f12.members.map((x) => x.userId)).toEqual(["e"]);
    const f1 = rows[rows.length - 1] as { emptySlots?: number };
    // 1층에 d 한 명: 마지막 줄의 남은 2칸만 그리고, 나머지(20-5-2)는 "빈방 n개"로 접는다
    expect(f1.emptySlots).toBe(2);
    expect((f1 as { vacantMore?: number }).vacantMore).toBe(VILLA_CAPACITY - members.length - 2);
  });

  it("vacancy_collapse_cases", () => {
    const f1 = (ms: Member[]) => layoutFloors(ms, null).filter((r) => "floor" in r && r.floor === 1).pop() as { emptySlots?: number; vacantMore?: number };
    // 1층이 꽉 찬 줄이면 새 한 줄(3칸)
    const three = [m("a", 1), m("b", 1), m("c", 1)];
    expect(f1(three)).toMatchObject({ emptySlots: 3, vacantMore: VILLA_CAPACITY - 3 - 3 });
    // 만원이면 빈방 없음
    const full = Array.from({ length: VILLA_CAPACITY }, (_, i) => m(`u${i}`, 1));
    expect(f1(full).emptySlots).toBe(0);
    expect(f1(full).vacantMore).toBeUndefined();
    // 빈방이 한 줄 안에 다 들어가면 접지 않는다
    const nearly = Array.from({ length: VILLA_CAPACITY - 2 }, (_, i) => m(`u${i}`, 1));
    expect(f1(nearly).emptySlots).toBe(2);
    expect(f1(nearly).vacantMore).toBeUndefined();
  });

  it("collapses_9_to_11", () => {
    const rows = layoutFloors([m("a", 12), m("b", 8)], null);
    expect(rows.map((r) => ("gap" in r ? r.gap : r.floor))).toEqual([12, [9, 11], 8, [2, 7], 1]);
  });

  it("sorts_by_streak_desc_within_floor", () => {
    const rows = layoutFloors([m("a", 3, 1), m("b", 3, 9), m("c", 3, 5)], null);
    const f3 = rows.find((r) => "floor" in r && r.floor === 3) as { members: Member[] };
    expect(f3.members.map((x) => x.userId)).toEqual(["b", "c", "a"]);
  });

  it("wraps_more_than_3_members_onto_extra_rows_same_floor", () => {
    const rows = layoutFloors([m("a", 2, 4), m("b", 2, 3), m("c", 2, 2), m("d", 2, 1)], null);
    const f2 = rows.filter((r) => "floor" in r && r.floor === 2) as { members: Member[] }[];
    expect(f2.map((r) => r.members.length)).toEqual([3, 1]);
  });

  it("floor1_always_present_even_empty", () => {
    const rows = layoutFloors([m("a", 4)], null);
    const last = rows[rows.length - 1] as { floor: number; members: Member[]; emptySlots?: number };
    expect(last.floor).toBe(1);
    expect(last.members).toEqual([]);
    expect(last.emptySlots).toBe(3);
    expect((last as { vacantMore?: number }).vacantMore).toBe(VILLA_CAPACITY - 1 - 3);
    expect(rows.map((r) => ("gap" in r ? r.gap : r.floor))).toEqual([4, [2, 3], 1]);
  });
});

describe("RoomTile", () => {
  const render = (member: Member) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <RoomTile member={member} isMe={false} isOwner={false} />
      </MemoryRouter>,
    );
  it("lit_room_has_lit_class_and_no_sleep_z", () => {
    const h = render(m("a", 3, 1, true));
    expect(h).toContain("room on");
    expect(h).toContain("헬스");
    expect(h).not.toContain(">z<");
  });
  it("unlit_room_renders_sleep_avatar", () => {
    const h = render(m("a", 3, 1, false));
    expect(h).not.toContain("room on");
    expect(h).toContain(">z<");
    expect(h).toContain("헬스");
  });
});

describe("Building penthouse row", () => {
  it("renders_penthouse_room_as_single_full_width_room", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Building members={[m("a", 12, 50), m("b", 1)]} penthouseUserId="a" ownerId="a" meId="a" />
      </MemoryRouter>,
    );
    const ph = html.match(/<div class="ph"[^]*?<\/button>/)![0];
    expect(ph).toContain("PENTHOUSE");
    expect(ph).toContain("ph-wide");
    expect(ph).toContain('data-penthouse="true"');
    expect(ph.match(/class="room /g)).toHaveLength(1);
    expect(html.match(/data-penthouse="true"/g)).toHaveLength(1);
  });
});
