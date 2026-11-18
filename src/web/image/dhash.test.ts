import { describe, expect, it } from "vitest";
import { dhashFromGray } from "./dhash";
import { hamming } from "../../shared/rules/dhash";
import { stepQuality, compressImage, ImageDecodeError } from "./compress";

const gray = () => Uint8Array.from({ length: 72 }, (_, i) => (i * 37) % 251);

describe("dhash", () => {
  it("same array same hash, 16 hex", () => {
    const h = dhashFromGray(gray());
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(dhashFromGray(gray())).toBe(h);
  });
  it("one pixel change keeps hamming <= 2", () => {
    const g = gray();
    const g2 = gray();
    g2[10] = (g2[10] + 100) % 256;
    expect(hamming(dhashFromGray(g), dhashFromGray(g2))).toBeLessThanOrEqual(2);
  });
});

describe("stepQuality", () => {
  const blob = (n: number) => new Blob([new Uint8Array(n)]);
  it("stops at first small-enough quality", async () => {
    const qs: number[] = [];
    const out = await stepQuality(async (q) => {
      qs.push(q);
      return blob(q > 0.65 ? 200_000 : 100_000);
    });
    expect(qs).toEqual([0.8, 0.7, 0.6]);
    expect(out.size).toBe(100_000);
  });
  it("returns last blob at floor even if larger", async () => {
    const qs: number[] = [];
    const out = await stepQuality(async (q) => {
      qs.push(q);
      return blob(500_000 + Math.round(q * 10));
    });
    expect(qs).toEqual([0.8, 0.7, 0.6, 0.5]);
    expect(out.size).toBe(500_005);
  });
  it("first try ok", async () => {
    const qs: number[] = [];
    await stepQuality(async (q) => (qs.push(q), blob(10)));
    expect(qs).toEqual([0.8]);
  });
});

describe("compressImage", () => {
  it("wraps decode failure in ImageDecodeError", async () => {
    (globalThis as any).createImageBitmap = () => Promise.reject(new Error("bad"));
    await expect(compressImage(new File(["x"], "a.heic"))).rejects.toBeInstanceOf(ImageDecodeError);
    delete (globalThis as any).createImageBitmap;
  });
});
