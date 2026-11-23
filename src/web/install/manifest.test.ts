import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 홈 화면 앱(PWA) 설정이 맞는지: 매니페스트 · 그림 파일 · index.html 메타
const ROOT = join(__dirname, "..", "..", "..");
const PUB = join(ROOT, "public");
const manifest = JSON.parse(readFileSync(join(PUB, "manifest.webmanifest"), "utf8"));
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const file = (src: string) => join(PUB, src.replace(/^\//, ""));

/** PNG 머리에서 가로 · 세로 읽기 */
function pngSize(path: string) {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

type Img = { src: string; sizes: string; type: string; purpose?: string; form_factor?: string; label?: string };

describe("manifest.webmanifest", () => {
  it("required_fields", () => {
    expect(manifest).toMatchObject({
      id: "/",
      name: "오운완아파트",
      short_name: "오운완아파트",
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "ko",
      orientation: "portrait",
      background_color: "#FFFFFF",
      theme_color: "#FFFFFF",
    });
    expect(manifest.description.length).toBeGreaterThan(10);
    expect(manifest.categories).toEqual(["health", "fitness", "lifestyle"]);
  });

  it("icons_exist_with_declared_sizes_and_maskable_present", () => {
    const icons: Img[] = manifest.icons;
    for (const i of icons) {
      expect(existsSync(file(i.src)), i.src).toBe(true);
      expect(pngSize(file(i.src))).toBe(i.sizes);
    }
    expect(icons.some((i) => i.sizes === "192x192" && (i.purpose ?? "any").includes("any"))).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && (i.purpose ?? "any").includes("any"))).toBe(true);
    expect(icons.some((i) => i.purpose?.includes("maskable") && i.sizes === "512x512")).toBe(true);
  });

  it("screenshots_are_narrow_and_exist", () => {
    const shots: Img[] = manifest.screenshots;
    expect(shots.length).toBeGreaterThanOrEqual(2);
    for (const s of shots) {
      expect(s.form_factor).toBe("narrow");
      expect(s.label).toBeTruthy();
      expect(existsSync(file(s.src)), s.src).toBe(true);
      expect(pngSize(file(s.src))).toBe(s.sizes);
      const [w, h] = s.sizes.split("x").map(Number);
      expect(h).toBeGreaterThan(w);
      // 작게 유지 (한 장 400KB 이하)
      expect(readFileSync(file(s.src)).length).toBeLessThan(400_000);
    }
  });

  it("shortcuts_point_inside_scope_with_icons", () => {
    const urls = manifest.shortcuts.map((s: { url: string }) => s.url);
    expect(urls).toEqual(["/certify", "/villa"]);
    for (const s of manifest.shortcuts as { name: string; icons: Img[] }[]) {
      expect(s.name).toBeTruthy();
      for (const i of s.icons) {
        expect(existsSync(file(i.src)), i.src).toBe(true);
        expect(pngSize(file(i.src))).toBe(i.sizes);
      }
    }
  });
});

describe("index.html 홈 화면 앱 메타", () => {
  it("ios_and_android_meta", () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="default"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="오운완아파트"');
    // 머리말과 같은 흰색
    expect(html).toContain(`name="theme-color" content="${manifest.theme_color}"`);
  });

  it("splash_images_exist_and_match_media", () => {
    const links = [...html.matchAll(/rel="apple-touch-startup-image" href="([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/g)];
    expect(links.length).toBeGreaterThanOrEqual(4);
    for (const [, href, w, h, r] of links) {
      expect(existsSync(file(href)), href).toBe(true);
      expect(pngSize(file(href))).toBe(`${Number(w) * Number(r)}x${Number(h) * Number(r)}`);
    }
  });
});

describe("서비스 워커는 푸시만", () => {
  it("no_fetch_handler_or_cache", () => {
    const sw = readFileSync(join(PUB, "sw.js"), "utf8");
    expect(sw).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(sw).not.toMatch(/caches\./);
  });
});
