import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SPORTS, SPORT_LABEL } from "./sports";
import { BASE_FURNITURE } from "./catalog";

const PUB = join(import.meta.dirname, "../../public");

describe("종목", () => {
  it("eight_sports_in_planner_order_with_korean_labels", () => {
    expect(SPORTS).toEqual(["gym", "pilates", "yoga", "hometraining", "running", "climbing", "jiujitsu", "taekwondo"]);
    expect(SPORTS.map((s) => SPORT_LABEL[s])).toEqual(["헬스", "필라테스", "요가", "홈트", "러닝", "클라이밍", "주짓수", "태권도"]);
  });
  it("every_sport_has_a_sprite_folder_with_small_art", () => {
    for (const s of SPORTS) {
      const meta = join(PUB, "avatar2", s, "meta.json");
      expect(existsSync(meta), s).toBe(true);
      expect(JSON.parse(readFileSync(meta, "utf8")).pose, s).toBe(s);
      const m = JSON.parse(readFileSync(meta, "utf8"));
      expect(existsSync(join(PUB, "avatar2", s, "sm", `body-${m.outfits[0]}-s0.webp`)), s).toBe(true);
    }
  });
  it("every_sport_has_three_shop_items_with_art_files", () => {
    for (const s of SPORTS) {
      const items = BASE_FURNITURE.filter((i) => i.sport === s);
      expect(items, s).toHaveLength(3);
      for (const i of items) for (const f of [`${i.id}.webp`, `sm/${i.id}.webp`]) expect(existsSync(join(PUB, "furniture", f)), f).toBe(true);
    }
    expect(BASE_FURNITURE.filter((i) => i.sport === "yoga").map((i) => i.id)).toEqual(["yoga-blocks", "meditation-cushion", "singing-bowl"]);
    expect(BASE_FURNITURE.filter((i) => i.sport === "hometraining").map((i) => [i.id, i.slotType])).toEqual([
      ["pushup-bars", "floor"],
      ["step-box", "floor"],
      ["jump-rope-wall", "wall"],
    ]);
    // 필라테스 가구는 그대로
    expect(BASE_FURNITURE.filter((i) => i.sport === "pilates").map((i) => i.id)).toEqual(["reformer", "gym-ball", "foam-roller"]);
  });
});
