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
  it("svg_character_option_keeps_old_rig_for_landing", () => {
    const h = renderToStaticMarkup(<RoomScene sport="running" lit={false} avatar={DEFAULT_AVATAR} character="svg" />);
    expect(h).toContain("pose-sleep");
    expect(h).toContain(">z<");
    expect(h).not.toContain("avatar2");
  });
  it("penthouse_has_chandelier_skyline_sofa", () => {
    const h = renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} penthouse />);
    for (const p of ["chandelier", "skyline", "sofa", "plant"]) expect(h).toContain(`data-part="${p}"`);
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
});
