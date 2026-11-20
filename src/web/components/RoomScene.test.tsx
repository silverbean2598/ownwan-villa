// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomScene } from "./RoomScene";
import { DEFAULT_AVATAR } from "../../shared/avatar";
import { SPORTS } from "../../shared/sports";
import { BASE_FURNITURE, EXTRA_FURNITURE } from "../../shared/catalog";
import { FURNITURE_ART } from "./furniture";

describe("RoomScene", () => {
  it("lit_room_shows_sport_sprite_and_equipment", () => {
    for (const sport of SPORTS) {
      const h = renderToStaticMarkup(<RoomScene sport={sport} lit avatar={DEFAULT_AVATAR} />);
      expect(h).toContain(`class="spr p-${sport}"`);
      expect(h).toContain(`/avatar2/${sport}/`);
      // 클라이밍 벽 · 필라테스 매트는 새 캐릭터 그림에 들어 있다
      if (sport === "climbing" || sport === "pilates") expect(h).not.toContain("data-equip=");
      else expect(h).toContain(`data-equip="${sport}"`);
      expect(h).not.toContain('class="av ');
    }
  });
  it("unlit_room_sleeps_with_moonlight", () => {
    const h = renderToStaticMarkup(<RoomScene sport="climbing" lit={false} avatar={DEFAULT_AVATAR} />);
    expect(h).toContain('class="spr p-sleep"');
    expect(h).toContain("/avatar2/sleep/body-tee-s0.webp");
    expect(h).toContain('data-part="moonbeam"');
    // 잘 때는 기구가 옆에 그대로 있다
    expect(h).toContain('data-equip="climbing"');
  });
  it("penthouse_has_chandelier_skyline_sofa", () => {
    const h = renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} penthouse />);
    for (const p of ["chandelier", "skyline", "sofa", "plant"]) expect(h).toContain(`data-part="${p}"`);
  });
  it("penthouse_uses_generated_art_with_glow_only_when_lit", () => {
    const lit = renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} penthouse variant="detail" />);
    expect(lit).toContain('href="/furniture/penthouse-chandelier.webp"');
    expect(lit).toContain('href="/furniture/penthouse-sofa.webp"');
    expect(lit).toContain('href="/furniture/penthouse-plant.webp"');
    expect(lit).toContain('data-part="chandelier-glow"');
    expect(lit).toContain("radialGradient");
    const off = renderToStaticMarkup(<RoomScene sport="gym" lit={false} avatar={DEFAULT_AVATAR} penthouse variant="detail" />);
    expect(off).toContain('href="/furniture/penthouse-chandelier-off.webp"');
    expect(off).not.toContain('data-part="chandelier-glow"');
    for (const p of ["chandelier", "skyline", "sofa", "plant"]) expect(off).toContain(`data-part="${p}"`);
    // 빌라 칸은 작은 그림
    const tile = renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} penthouse />);
    expect(tile).toContain('href="/furniture/sm/penthouse-chandelier.webp"');
    expect(tile).toContain('href="/furniture/sm/penthouse-sofa.webp"');
  });
  it("tile_has_small_cork_board_detail_leaves_wall_for_board", () => {
    expect(renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} />)).toContain('data-part="cork"');
    const d = renderToStaticMarkup(
      <RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} variant="detail" board={<p>BOARD</p>} />,
    );
    expect(d).not.toContain('data-part="cork"');
    expect(d).toMatch(/class="wall-board"[^]*BOARD/);
  });
  it("every_catalog_item_has_a_drawing", () => {
    for (const i of BASE_FURNITURE) expect(FURNITURE_ART[i.id], i.id).toBeTypeOf("function");
  });
  it("every_new_furniture_item_has_a_drawing_and_draws_in_its_slot", () => {
    for (const i of EXTRA_FURNITURE) {
      expect(FURNITURE_ART[i.id], i.id).toBeTypeOf("function");
      const slot = i.slotType === "wall" ? "wall2" : "floor1";
      expect(renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} placements={[{ slot, itemId: i.id }]} />), i.id).toContain(`data-item="${i.id}"`);
    }
  });
  it("draws_placed_furniture_in_tile_detail_and_penthouse", () => {
    const placements = [
      { slot: "wall1", itemId: "trophy-shelf" },
      { slot: "wall2", itemId: "landscape-frame" },
      { slot: "floor1", itemId: "plant" },
      { slot: "floor3", itemId: "bench" },
    ];
    for (const props of [{}, { variant: "detail" as const }, { penthouse: true }]) {
      const h = renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} placements={placements} {...props} />);
      for (const p of placements) expect(h).toContain(`data-item="${p.itemId}"`);
      expect(h).not.toContain("feColorMatrix");
    }
  });
  it("unlit_room_dims_furniture_and_ignores_bad_slots", () => {
    const h = renderToStaticMarkup(
      <RoomScene sport="gym" lit={false} avatar={DEFAULT_AVATAR} placements={[{ slot: "floor3", itemId: "rug" }, { slot: "roof", itemId: "plant" }]} />,
    );
    expect(h).toContain('data-item="rug"');
    expect(h).not.toContain('data-item="plant"');
    expect(h).toMatch(/filter="url\(#[^)]+f\)"/);
  });
  it("normal_room_pendant_is_generated_art_lit_and_unlit", () => {
    const lit = renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} variant="detail" />);
    expect(lit).toContain('data-part="pendant"');
    expect(lit).toContain('href="/furniture/room-pendant.webp"');
    expect(lit).toContain('data-part="lamplight"');
    expect(lit).toContain("radialGradient");
    const off = renderToStaticMarkup(<RoomScene sport="gym" lit={false} avatar={DEFAULT_AVATAR} variant="detail" />);
    expect(off).toContain('href="/furniture/room-pendant-off.webp"');
    expect(off).not.toContain('data-part="lamplight"');
    // 빌라 칸은 작은 그림, 펜트하우스는 펜던트 대신 샹들리에
    expect(renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} />)).toContain('href="/furniture/sm/room-pendant.webp"');
    expect(renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} penthouse />)).not.toContain('data-part="pendant"');
  });
  it("side_wall_items_are_skewed_back_wall_items_face_front", () => {
    const placements = [
      { slot: "wall1", itemId: "owunwan-frame" },
      { slot: "wall2", itemId: "landscape-frame" },
    ];
    for (const props of [{}, { variant: "detail" as const }, { penthouse: true }]) {
      const h = renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} placements={placements} {...props} />);
      const m1 = h.match(/data-slot="wall1" data-plane="right" transform="matrix\(([-\d. ]+)\)"/)!;
      const [, b1] = m1[1].split(" ").map(Number);
      expect(b1).not.toBe(0);
      const m2 = h.match(/data-slot="wall2" data-plane="back" transform="matrix\(([-\d. ]+)\)"/)!;
      const [a2, b2, c2, d2] = m2[1].split(" ").map(Number);
      expect([b2, c2]).toEqual([0, 0]);
      expect(a2).toBe(d2);
    }
  });
  it("floor_items_are_depth_sorted_around_the_character", () => {
    const placements = [
      { slot: "floor3", itemId: "bench" },
      { slot: "floor1", itemId: "plant" },
      { slot: "floor2", itemId: "aquarium" },
    ];
    const h = renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} variant="detail" placements={placements} />);
    // 뒤 구석(floor1 · floor2) → 캐릭터 → 앞 구석(floor3)
    const at = (s: string) => h.indexOf(s);
    expect(at('data-slot="floor1"')).toBeGreaterThan(0);
    expect(at('data-slot="floor2"')).toBeGreaterThan(0);
    expect(at('data-slot="floor1"')).toBeLessThan(at('class="spr '));
    expect(at('data-slot="floor2"')).toBeLessThan(at('class="spr '));
    expect(at('data-slot="floor3"')).toBeGreaterThan(at('class="spr '));
    // 바닥 가구는 정면 · 같은 비율, 앞 가구가 더 크다
    const scale = (slot: string) => Number(h.match(new RegExp(`data-slot="${slot}" data-plane="floor" transform="matrix\\(([\\d.]+)`))![1]);
    expect(scale("floor3")).toBeGreaterThan(scale("floor2"));
  });
});
