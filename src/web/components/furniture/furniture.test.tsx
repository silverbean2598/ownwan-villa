// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { FURNITURE, SLOTS } from "../../../shared/catalog";
import { DEFAULT_AVATAR } from "../../../shared/avatar";
import { RoomScene } from "../RoomScene";
import { FURNITURE_ART, Furniture, FurnitureIcon, furnitureBox, furnitureUrl, hasFurnitureImage } from "./index";
import { FURNITURE_IMG } from "./art";
import { GEOM } from "../room/Box";
import { placeSlot, placedQuad, standPoint } from "./layout";

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

  it("wide_floor_items_stay_inside_the_box", () => {
    for (const [variant, penthouse, g] of [
      ["detail", false, GEOM.detail],
      ["detail", true, GEOM.detail],
      ["tile", false, GEOM.tile],
      ["tile", true, GEOM.phTile],
    ] as const) {
      for (const slot of ["floor1", "floor2", "floor3"] as const)
        for (const itemId of ["reformer", "rowing-machine", "rug", "bookshelf"]) {
          const tag = `${variant} ${penthouse} ${slot} ${itemId}`;
          const q = placedQuad(placeSlot(variant, penthouse, slot, itemId));
          for (const [x] of q) {
            expect(x, tag).toBeGreaterThanOrEqual(0);
            expect(x, tag).toBeLessThanOrEqual(g.W);
          }
        }
    }
  });

  it("detail_room_is_wide_and_tiles_keep_their_geometry", () => {
    // 방 상세는 가로가 더 긴 넓은 방, 빌라 칸은 그대로
    expect(GEOM.detail.W).toBeGreaterThan(GEOM.detail.H);
    expect((GEOM.detail.bx1 - GEOM.detail.bx0) / GEOM.detail.W).toBeGreaterThan(0.5);
    expect(GEOM.tile).toEqual({ W: 150, H: 100, bx0: 30, bx1: 120, by0: 16, by1: 68 });
    expect(GEOM.phTile).toEqual({ W: 240, H: 100, bx0: 36, bx1: 204, by0: 14, by1: 70 });
  });

  it("slots_sit_on_their_planes_and_floor_items_scale_with_depth", () => {
    for (const [variant, penthouse, g] of [
      ["detail", false, GEOM.detail],
      ["detail", true, GEOM.detail],
      ["tile", false, GEOM.tile],
      ["tile", true, GEOM.phTile],
    ] as const) {
      const tag = `${variant} ${penthouse}`;
      const { W, H, bx0, bx1, by0, by1 } = g;
      // 뒷벽 자리: 정면(기울임 없음), 상자 전체가 뒷벽 안
      const back = placeSlot(variant, penthouse, "wall2", "landscape-frame");
      expect(back.plane).toBe("back");
      expect(back.m[1]).toBe(0);
      for (const [x, y] of placedQuad(back)) {
        expect(x, tag).toBeGreaterThan(bx0);
        expect(x, tag).toBeLessThan(bx1);
        expect(y, tag).toBeGreaterThan(by0);
        expect(y, tag).toBeLessThan(by1);
      }
      // 오른쪽 벽 자리: 벽면 원근대로 기울고(skew), 네 꼭짓점이 오른쪽 벽면(위 · 아래 모서리 사이) 안
      const side = placeSlot(variant, penthouse, "wall1", "owunwan-frame");
      expect(side.plane).toBe("right");
      expect(side.m[1], tag).not.toBe(0);
      for (const [x, y] of placedQuad(side)) {
        const d = (x - bx1) / (W - bx1);
        expect(d, tag).toBeGreaterThan(0);
        expect(d, tag).toBeLessThan(1);
        expect(y, tag).toBeGreaterThan(by0 * (1 - d));
        expect(y, tag).toBeLessThan(by1 + (H - by1) * d);
      }
      // 바닥 자리: 바닥에 닿는 점이 바닥 사다리꼴 안, 캐릭터 가운데 자리는 비워 둔다
      const stand = standPoint(variant, penthouse);
      const floors = (["floor1", "floor2", "floor3"] as const).map((s) => placeSlot(variant, penthouse, s, "plant"));
      for (const f of floors) {
        const y = f.m[5];
        const t = (y - by1) / (H - by1);
        expect(t, `${tag} ${f.slot}`).toBeGreaterThan(0);
        expect(t, `${tag} ${f.slot}`).toBeLessThanOrEqual(1);
        const [[qx0], [qx1]] = placedQuad(f);
        expect(qx0, `${tag} ${f.slot}`).toBeGreaterThanOrEqual(bx0 * (1 - t));
        expect(qx1, `${tag} ${f.slot}`).toBeLessThanOrEqual(bx1 + (W - bx1) * t);
        expect(qx1 < stand.x || qx0 > stand.x, `${tag} ${f.slot} 캐릭터 자리`).toBe(true);
      }
      // 깊이: 뒤 구석 가구는 앞 구석 가구보다 작다(같은 가구, 높이 제한 없는 자리끼리)
      const backF = placeSlot(variant, penthouse, penthouse ? "floor1" : "floor2", "bench");
      const frontF = placeSlot(variant, penthouse, "floor3", "bench");
      expect(backF.m[5], tag).toBeLessThan(frontF.m[5]);
      expect(backF.m[0], tag).toBeLessThan(frontF.m[0]);
      expect(backF.front, tag).toBe(false);
      expect(frontF.front, tag).toBe(true);
    }
  });

  it("empty_slots_have_a_box_for_the_edit_overlay", () => {
    for (const s of SLOTS) {
      const p = placeSlot("detail", false, s, null);
      expect(p.box[2], s).toBeGreaterThan(0);
      expect(p.box[3], s).toBeGreaterThan(0);
    }
  });

  it("penthouse_art_files_exist_full_and_small", () => {
    for (const n of ["chandelier", "chandelier-off", "sofa", "plant"])
      for (const sub of ["", "sm/"]) {
        const f = path.join(PUB, "furniture", `${sub}penthouse-${n}.webp`);
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size, f).toBeGreaterThan(1000);
      }
  });
});
