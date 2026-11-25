import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 플레이스토어 앱(TWA)과 사이트를 잇는 파일. 패키지 이름과 지문이 android/twa-manifest.json 과 어긋나면
// 앱 위쪽에 주소창이 보이게 된다 (사이트 확인 실패).
describe("public/.well-known/assetlinks.json", () => {
  const links = JSON.parse(readFileSync("public/.well-known/assetlinks.json", "utf8"));
  const twa = JSON.parse(readFileSync("android/twa-manifest.json", "utf8"));

  it("points to the app package with the full-URL handling relation", () => {
    expect(links).toHaveLength(1);
    expect(links[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(links[0].target.namespace).toBe("android_app");
    expect(links[0].target.package_name).toBe(twa.packageId);
  });

  it("lists every fingerprint in the TWA manifest, in SHA-256 colon format", () => {
    const fps: string[] = links[0].target.sha256_cert_fingerprints;
    for (const f of fps) expect(f).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    for (const f of twa.fingerprints) expect(fps).toContain(f.value);
  });
});
