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
});
