import { describe, expect, it } from "vitest";
import { AVATAR_OPTIONS, DEFAULT_AVATAR, parseAvatar } from "./avatar";

describe("parseAvatar", () => {
  it("accepts_valid_spec", () => {
    expect(parseAvatar({ skin: 1, hair: "bun", shirt: 7 })).toEqual({ skin: 1, hair: "bun", shirt: 7 });
  });
  it("rejects_out_of_range_or_malformed", () => {
    expect(parseAvatar({ skin: 9, hair: "short", shirt: 0 })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "mohawk", shirt: 0 })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 8 })).toBeNull();
    expect(parseAvatar({ skin: 0.5, hair: "short", shirt: 0 })).toBeNull();
    expect(parseAvatar({})).toBeNull();
    expect(parseAvatar(null)).toBeNull();
    expect(parseAvatar("x")).toBeNull();
  });
  it("default_is_valid", () => {
    expect(parseAvatar(DEFAULT_AVATAR)).toEqual(DEFAULT_AVATAR);
    expect(AVATAR_OPTIONS.skin).toHaveLength(4);
    expect(AVATAR_OPTIONS.shirt).toHaveLength(8);
  });

  // 꾸미기 확장
  it("has_10_hairstyles_keeping_the_old_4", () => {
    expect(AVATAR_OPTIONS.hair).toEqual(["short", "long", "bun", "buzz", "side-part", "afro", "pigtails", "ponytail", "wolf", "beanie"]);
    for (const hair of AVATAR_OPTIONS.hair) expect(parseAvatar({ skin: 0, hair, shirt: 0 }), hair).toEqual({ skin: 0, hair, shirt: 0 });
  });
  it("old_stored_avatar_json_parses_unchanged", () => {
    const stored = JSON.parse('{"skin":2,"hair":"long","shirt":5}');
    const a = parseAvatar(stored);
    expect(a).toEqual({ skin: 2, hair: "long", shirt: 5 });
    expect(JSON.stringify(a)).toBe('{"skin":2,"hair":"long","shirt":5}');
  });
  it("accepts_outfit_and_accessories", () => {
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, outfit: "hoodie", acc: ["cap", "glasses", "towel"] })).toEqual({
      skin: 0, hair: "short", shirt: 0, outfit: "hoodie", acc: ["cap", "glasses", "towel"],
    });
    // 빈 목록은 저장하지 않는다
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, acc: [] })).toEqual({ skin: 0, hair: "short", shirt: 0 });
    // null 옷 = 기본 옷
    expect(JSON.stringify(parseAvatar({ skin: 0, hair: "short", shirt: 0, outfit: null }))).toBe('{"skin":0,"hair":"short","shirt":0}');
  });
  it("rejects_unknown_outfit_or_accessory", () => {
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, outfit: "tuxedo" })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, outfit: "cap" })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, outfit: 3 })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, acc: ["crown"] })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, acc: ["hoodie"] })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, acc: "cap" })).toBeNull();
  });
  it("one_accessory_per_body_slot", () => {
    // 헤어밴드와 모자는 둘 다 머리
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, acc: ["headband", "cap"] })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, acc: ["cap", "cap"] })).toBeNull();
    expect(parseAvatar({ skin: 0, hair: "short", shirt: 0, acc: ["headband", "glasses", "earphones", "towel", "wristbands"] })).not.toBeNull();
  });
});
