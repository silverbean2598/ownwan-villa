// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildingShape, buildingHeight, colsFor, layoutCity, MAX_STORIES, slotToLot, wallColor, WALLS } from "./layout";
import { CityMap } from "./CityMap";
import { buildingLabel, shortName } from "./CityBuilding";
import type { CityVilla } from "../../../shared/city";

const v = (slot: number, o: Partial<CityVilla> = {}): CityVilla => ({
  id: `villa-${slot}`, name: `아파트${slot}`, slot, topFloor: 1, memberCount: 3, litCount: 1, penthouseNickname: "민지", ...o,
});
const count = (ws: string[], s: string) => ws.filter((w) => w === s).length;

describe("buildingShape", () => {
  it("one_window_per_member_lit_count_matches", () => {
    const s = buildingShape(3, 6, 4, 42);
    expect(s.stories).toBe(3);
    expect(count(s.windows, "lit")).toBe(4);
    expect(count(s.windows, "dark")).toBe(2);
    expect(count(s.windows, "vacant")).toBe(s.windows.length - 6);
  });

  it("stories_follow_top_floor_capped_and_tall_from_6", () => {
    expect(buildingShape(1, 1, 0).stories).toBe(1);
    expect(buildingShape(5, 1, 0).tall).toBe(false);
    expect(buildingShape(6, 1, 0).tall).toBe(true);
    expect(buildingShape(40, 2, 0).stories).toBe(MAX_STORIES);
    expect(buildingShape(0, 1, 0).stories).toBe(1);
    expect(buildingHeight(buildingShape(8, 3, 0))).toBeGreaterThan(buildingHeight(buildingShape(2, 3, 0)));
  });

  it("lit_never_exceeds_members_or_windows", () => {
    const s = buildingShape(1, 20, 20, 1);
    expect(s.windows.length).toBe(4); // 1층짜리는 칸이 4개뿐
    expect(count(s.windows, "lit")).toBe(4);
    expect(count(buildingShape(2, 3, 9).windows, "lit")).toBe(3);
    expect(count(buildingShape(2, 0, 0).windows, "vacant")).toBe(6);
  });

  it("member_windows_fill_from_bottom_and_are_deterministic", () => {
    const s = buildingShape(3, 3, 0);
    expect(s.windows.slice(-3)).toEqual(["dark", "dark", "dark"]);
    expect(s.windows.slice(0, 6).every((w) => w === "vacant")).toBe(true);
    expect(buildingShape(4, 10, 5, 7).windows).toEqual(buildingShape(4, 10, 5, 7).windows);
  });
});

describe("layoutCity", () => {
  it("slots_map_to_lots_with_a_park_every_fifth_lot", () => {
    expect([0, 1, 2, 3, 4, 5, 8].map(slotToLot)).toEqual([0, 1, 2, 3, 5, 6, 10]);
  });

  it("one_villa_still_fills_the_map_with_props", () => {
    const L = layoutCity([v(0)], 2);
    expect(L.lots.length).toBe(8);
    expect(L.lots.filter((l) => l.villa).length).toBe(1);
    expect(L.lots.filter((l) => l.prop).length).toBe(7);
  });

  it("grows_rows_for_high_slots_and_tall_buildings", () => {
    const L = layoutCity([v(0), v(20, { topFloor: 12 })], 2);
    expect(L.lots.find((l) => l.villa?.slot === 20)!.index).toBe(25);
    const tallRow = L.lots.find((l) => l.villa?.slot === 20)!.row;
    expect(L.rowsY[tallRow].h).toBeGreaterThan(L.rowsY[0].h);
  });

  it("cols_by_width_and_wall_color_from_id", () => {
    expect(colsFor(390)).toBe(2);
    expect(colsFor(1100)).toBe(5);
    expect(WALLS).toContain(wallColor("abc"));
    expect(wallColor("abc")).toBe(wallColor("abc"));
  });
});

describe("CityMap", () => {
  it("buildings_are_buttons_with_labels_and_mine_marked", () => {
    const html = renderToStaticMarkup(
      <CityMap villas={[v(0, { litCount: 2 }), v(1, { name: "새벽런닝", litCount: 0 })]} cols={2} mineId="villa-0" selectedId={null} onSelect={() => {}} />,
    );
    expect(html).toContain('aria-label="우리 아파트, 아파트0, 오늘 불 켜진 방 2개"');
    expect(html).toContain('aria-label="새벽런닝, 오늘 불 켜진 방 0개"');
    expect((html.match(/role="button"/g) ?? []).length).toBe(2);
    expect((html.match(/우리 아파트<\/text>/g) ?? []).length).toBe(1);
    expect((html.match(/class="cw lit"/g) ?? []).length).toBe(2);
  });

  it("labels_and_names", () => {
    expect(shortName("아주아주긴아파트이름이에요")).toBe("아주아주긴아파…");
    expect(buildingLabel(v(0), false)).toBe("아파트0, 오늘 불 켜진 방 1개");
  });
});
