import { describe, expect, it } from "vitest";
import { DUPLICATE_HAMMING, hamming } from "./dhash";

describe("hamming", () => {
  it("counts bits", () => {
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming("0000000000000000", "0000000000000007")).toBe(3);
    expect(DUPLICATE_HAMMING).toBe(5);
  });
});
