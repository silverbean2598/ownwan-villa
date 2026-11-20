import { describe, expect, it } from "vitest";
import { ACCESSORIES, BASE_FURNITURE, EXTRA_FURNITURE, FURNITURE, OUTFITS, SHOP_ITEMS, findItem, findShopItem } from "./catalog";

const range = (ids: string[], lo: number, hi: number) => {
  for (const id of ids) {
    const p = findShopItem(id)!.price;
    expect(p, id).toBeGreaterThanOrEqual(lo);
    expect(p, id).toBeLessThanOrEqual(hi);
  }
};

describe("catalog (꾸미기 확장)", () => {
  it("ids_are_unique_across_every_kind", () => {
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    expect(SHOP_ITEMS).toHaveLength(25 + 24 + 6 + 7);
  });
  it("kinds", () => {
    expect(FURNITURE).toEqual([...BASE_FURNITURE, ...EXTRA_FURNITURE]);
    for (const i of FURNITURE) expect(i.kind, i.id).toBe("furniture");
    for (const i of OUTFITS) expect(i.kind, i.id).toBe("outfit");
    for (const i of ACCESSORIES) expect(i.kind, i.id).toBe("accessory");
  });
  it("24_new_furniture_are_common_with_category_and_prices_in_range", () => {
    expect(EXTRA_FURNITURE).toHaveLength(24);
    for (const i of EXTRA_FURNITURE) {
      expect(i.sport, i.id).toBe("common");
      expect(i.category, i.id).toBeTruthy();
    }
    const cat = (c: string) => EXTRA_FURNITURE.filter((i) => i.category === c).map((i) => i.id);
    expect(cat("운동 기구")).toHaveLength(10);
    expect(cat("휴식 가구")).toHaveLength(7);
    expect(cat("계절·특별")).toHaveLength(6);
    expect(cat("펜트하우스 전용")).toEqual(["gold-statue"]);
    range(cat("운동 기구"), 60, 200);
    range(cat("휴식 가구"), 80, 180);
    range(cat("계절·특별"), 60, 150);
    expect(findItem("gold-statue")).toMatchObject({ price: 300, penthouseOnly: true, slotType: "floor" });
    for (const id of ["jump-rope-hook", "stretch-frame", "heart-neon", "string-lights"]) expect(findItem(id)!.slotType, id).toBe("wall");
  });
  it("outfits_and_accessories", () => {
    expect(OUTFITS.map((i) => i.id)).toEqual(["tank-joggers", "hoodie", "sports-bra-leggings", "singlet", "cycling-jersey", "rashguard"]);
    range(OUTFITS.map((i) => i.id), 100, 150);
    expect(Object.fromEntries(ACCESSORIES.map((i) => [i.id, i.accSlot]))).toEqual({
      headband: "head", cap: "head", glasses: "face", earphones: "neck", towel: "shoulder", wristbands: "wrist", chicken: "wrist",
    });
    range(ACCESSORIES.map((i) => i.id), 50, 80);
  });
  it("findItem_is_furniture_only_findShopItem_is_everything", () => {
    expect(findItem("hoodie")).toBeUndefined();
    expect(findItem("bench")?.kind).toBe("furniture");
    expect(findItem("aquarium")?.kind).toBe("furniture");
    expect(findShopItem("hoodie")?.kind).toBe("outfit");
    expect(findShopItem("cap")?.kind).toBe("accessory");
    expect(findShopItem("sofa")).toBeUndefined();
  });
});
