// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { FURNITURE } from "../../../shared/catalog";
import { DEFAULT_AVATAR } from "../../../shared/avatar";
import { RoomScene } from "../RoomScene";
import { FURNITURE_ART, Furniture, FurnitureIcon, furnitureBox, furnitureUrl, hasFurnitureImage } from "./index";
import { FURNITURE_IMG } from "./art";
import { GEOM } from "../room/Box";

const PUB = path.join(import.meta.dirname, "../../../../public");

describe("가구 그림(webp)", () => {
  it("every_furniture_has_full_and_small_webp", () => {
    let total = 0;
    for (const i of FURNITURE) {
      for (const res of ["full", "sm"] as const) {
        const f = path.join(PUB, furnitureUrl(i.id, res));
        expect(existsSync(f), f).toBe(true);
        total += statSync(f).size;
      }
      expect(hasFurnitureImage(i.id), i.id).toBe(true);
      const [w, h] = FURNITURE_IMG[i.id];
      expect(w > 5 && h > 5 && w < 70 && h < 70, i.id).toBe(true);
    }
    // 가구 그림 전체는 가볍게 (6MB 미만)
    expect(total).toBeLessThan(6 * 1024 * 1024);
  });

  it("draws_image_floor_items_on_floor_wall_items_centered", () => {
    const h = renderToStaticMarkup(
      <svg>
        <Furniture itemId="plant" res="sm" />
      </svg>,
    );
    expect(h).toContain('href="/furniture/sm/plant.webp"');
    expect(h).toContain('data-item="plant"');
    const [, fy, , fh] = furnitureBox("plant")!;
    expect(fy).toBe(-fh); // 바닥 가구: 아래끝이 0
    const [, wy, , wh] = furnitureBox("wall-clock")!;
    expect(wy).toBe(-wh / 2); // 벽 가구: 가운데가 0
    expect(renderToStaticMarkup(<svg><Furniture itemId="wall-clock" /></svg>)).toContain('href="/furniture/wall-clock.webp"');
  });

  it("falls_back_to_old_svg_when_image_missing", () => {
    const saved = FURNITURE_IMG.plant;
    delete (FURNITURE_IMG as Record<string, unknown>).plant;
    try {
      const h = renderToStaticMarkup(<svg><Furniture itemId="plant" /></svg>);
      expect(h).toContain('data-item="plant"');
      expect(h).not.toContain("<image");
      expect(FURNITURE_ART.plant).toBeTypeOf("function");
      expect(renderToStaticMarkup(<FurnitureIcon itemId="plant" />)).toContain("<svg");
    } finally {
      (FURNITURE_IMG as Record<string, readonly [number, number]>).plant = saved;
    }
    expect(renderToStaticMarkup(<svg><Furniture itemId="nope" /></svg>)).toBe("<svg></svg>");
  });

  it("icon_uses_same_art_small_for_lists", () => {
    expect(renderToStaticMarkup(<FurnitureIcon itemId="bench" size={48} />)).toContain('src="/furniture/sm/bench.webp"');
    expect(renderToStaticMarkup(<FurnitureIcon itemId="bench" size={80} />)).toContain('src="/furniture/bench.webp"');
  });

  it("room_uses_small_art_in_tiles_full_in_detail", () => {
    const placements = [{ slot: "floor1", itemId: "bookshelf" }];
    expect(renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} placements={placements} />)).toContain("/furniture/sm/bookshelf.webp");
    expect(renderToStaticMarkup(<RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} variant="detail" placements={placements} />)).toContain(
      'href="/furniture/bookshelf.webp"',
    );
  });

  it("wide_front_items_stay_inside_the_box", () => {
    for (const [variant, penthouse, g] of [
      ["detail", false, GEOM.detail],
      ["tile", false, GEOM.tile],
      ["tile", true, GEOM.phTile],
    ] as const) {
      for (const slot of ["floor2", "floor3"]) {
        const h = renderToStaticMarkup(
          <RoomScene sport="gym" lit avatar={DEFAULT_AVATAR} variant={variant} penthouse={penthouse} placements={[{ slot, itemId: "reformer" }]} />,
        );
        const m = h.match(new RegExp(`data-slot="${slot}" transform="translate\\(([-\\d.]+) [-\\d.]+\\) scale\\(([\\d.]+)\\)"`))!;
        const x = +m[1];
        const hw = (FURNITURE_IMG.reformer[0] / 2) * +m[2];
        expect(x - hw, `${variant} ${penthouse} ${slot}`).toBeGreaterThanOrEqual(0);
        expect(x + hw, `${variant} ${penthouse} ${slot}`).toBeLessThanOrEqual(g.W);
      }
    }
  });
});
