// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomScene } from "./RoomScene";
import { DEFAULT_AVATAR } from "../../shared/avatar";
import { SPORTS } from "../../shared/sports";

describe("RoomScene", () => {
  it("lit_room_shows_sport_pose_and_equipment", () => {
    for (const sport of SPORTS) {
      const h = renderToStaticMarkup(<RoomScene sport={sport} lit avatar={DEFAULT_AVATAR} />);
      expect(h).toContain(`pose-${sport}`);
      expect(h).toContain(`data-equip="${sport}"`);
      expect(h).not.toContain(">z<");
    }
  });
  it("unlit_room_sleeps_with_moonlight", () => {
    const h = renderToStaticMarkup(<RoomScene sport="running" lit={false} avatar={DEFAULT_AVATAR} />);
    expect(h).toContain("pose-sleep");
    expect(h).toContain('data-part="moonbeam"');
    expect(h).toContain(">z<");
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
});
