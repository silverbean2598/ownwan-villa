// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AvatarEditor, HAIR_LABEL, toggleAcc } from "./AvatarEditor";
import { wearing } from "./WearPreview";
import { AVATAR_OPTIONS, DEFAULT_AVATAR, parseAvatar } from "../../shared/avatar";

describe("AvatarEditor", () => {
  it("every_hair_has_a_korean_label", () => {
    for (const h of AVATAR_OPTIONS.hair) expect(HAIR_LABEL[h], h).toMatch(/[가-힣]/);
  });
  it("toggle_accessory_keeps_one_per_slot", () => {
    let a = toggleAcc(DEFAULT_AVATAR, "headband");
    a = toggleAcc(a, "glasses");
    a = toggleAcc(a, "cap");
    expect(a.acc).toEqual(["glasses", "cap"]);
    expect(parseAvatar(a)).not.toBeNull();
    a = toggleAcc(toggleAcc(a, "cap"), "glasses");
    expect(a).toEqual(DEFAULT_AVATAR);
  });
  it("preview_wears_item_and_swaps_same_slot", () => {
    expect(wearing({ ...DEFAULT_AVATAR, acc: ["headband", "towel"] }, "cap").acc).toEqual(["towel", "cap"]);
    expect(wearing(DEFAULT_AVATAR, "hoodie").outfit).toBe("hoodie");
    expect(wearing({ ...DEFAULT_AVATAR, hair: "beanie" }, "cap").hair).toBe("short");
  });
  it("unowned_outfits_are_locked_with_price_and_shop_link", () => {
    const h = renderToStaticMarkup(
      <MemoryRouter>
        <AvatarEditor value={DEFAULT_AVATAR} onChange={() => {}} owned={["hoodie", "cap"]} />
      </MemoryRouter>,
    );
    expect(h).toContain("후드티");
    const doc = new DOMParser().parseFromString(h, "text/html");
    const locked = [...doc.querySelectorAll("a.wear.locked")];
    expect(locked.map((a) => a.getAttribute("href"))).toEqual(Array(5).fill("/shop?tab=outfit"));
    expect(locked.map((a) => a.getAttribute("aria-label"))).toContain("래시가드: 150P, 상점에서 사기");
    expect(locked.some((a) => a.textContent!.includes("후드티"))).toBe(false);
    expect(h).toContain("모자");
    expect(h).not.toContain("헤어밴드");
  });
});
