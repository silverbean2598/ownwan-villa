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
import { sceneGeom, slotAnchors } from "./layout";

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

  it("detail_room_is_wide_and_tiles_keep_their_geometry", () => {
    // 방 상세는 가로가 더 긴 넓은 방, 빌라 칸은 그대로
    expect(GEOM.detail.W).toBeGreaterThan(GEOM.detail.H);
    expect((GEOM.detail.bx1 - GEOM.detail.bx0) / GEOM.detail.W).toBeGreaterThan(0.5);
    expect(GEOM.tile).toEqual({ W: 150, H: 100, bx0: 30, bx1: 120, by0: 16, by1: 68 });
    expect(GEOM.phTile).toEqual({ W: 240, H: 100, bx0: 36, bx1: 204, by0: 14, by1: 70 });
  });

  it("detail_slots_sit_on_their_surfaces_and_floor_slots_do_not_overlap", () => {
    const g = GEOM.detail;
    for (const penthouse of [false, true]) {
      const a = slotAnchors("detail", penthouse);
      const tag = penthouse ? "penthouse" : "room";
      // 뒷벽 자리는 뒷벽 안, 오른쪽 벽 자리는 오른쪽 벽 안
      expect(a.wall2.x, tag).toBeGreaterThan(g.bx0);
      expect(a.wall2.x, tag).toBeLessThan(g.bx1);
      expect(a.wall2.y, tag).toBeGreaterThan(g.by0);
      expect(a.wall2.y, tag).toBeLessThan(g.by1);
      expect(a.wall1.x, tag).toBeGreaterThan(g.bx1);
      expect(a.wall1.x, tag).toBeLessThan(g.W);
      // 바닥 자리: 바닥(뒷벽 밑 ~ 화면 아래) 안, 가구 발자국(폭 46 · 깊이 12 배율)끼리 겹치지 않는다
      const floors = (["floor1", "floor2", "floor3"] as const).map((s) => a[s]);
      for (const f of floors) {
        expect(f.y, `${tag} ${f.slot}`).toBeGreaterThan(g.by1);
        expect(f.y, `${tag} ${f.slot}`).toBeLessThanOrEqual(g.H);
        expect(f.x - 23 * f.s, `${tag} ${f.slot}`).toBeGreaterThanOrEqual(0);
        expect(f.x + 23 * f.s, `${tag} ${f.slot}`).toBeLessThanOrEqual(g.W);
      }
      for (let i = 0; i < floors.length; i++)
        for (let j = i + 1; j < floors.length; j++) {
          const [p, q] = [floors[i], floors[j]];
          const apartX = Math.abs(p.x - q.x) >= 23 * (p.s + q.s);
          const apartY = Math.abs(p.y - q.y) >= 12 * (p.s + q.s);
          expect(apartX || apartY, `${tag} ${p.slot}-${q.slot}`).toBe(true);
        }
      // 캐릭터가 서는 바닥 가운데 자리는 비워 둔다
      const stand = sceneGeom("detail", penthouse);
      const cx = g.bx0 + (g.bx1 - g.bx0) * 0.5;
      for (const f of floors) expect(Math.abs(f.x - cx) > 20 * stand.k || Math.abs(f.y - (g.by1 + (g.H - g.by1) * 0.5)) > 20 * stand.k, `${tag} ${f.slot}`).toBe(true);
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
