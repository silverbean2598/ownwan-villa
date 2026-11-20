// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { SpriteAvatar } from "./SpriteAvatar";
import { FRAME_STEPS, cycleSeconds, outfitAsset, spriteBox, spriteLayers, spriteMeta } from "./layers";
import { SPRITE_MANIFEST } from "./manifest";
import { AVATAR_OPTIONS, DEFAULT_AVATAR, type AvatarSpec } from "../../../shared/avatar";
import { OUTFITS } from "../../../shared/catalog";
import type { Pose } from "../avatar/poses";

const ROOT = join(__dirname, "../../../..");
const POSES: Pose[] = ["idle", "sleep", "gym", "running", "pilates", "climbing", "jiujitsu", "taekwondo"];
const css = readFileSync(join(__dirname, "sprite.css"), "utf8");
const a = (x: Partial<AvatarSpec>): AvatarSpec => ({ ...DEFAULT_AVATAR, ...x });
const urls = (spec: AvatarSpec, pose: Pose) => spriteLayers(spec, pose).urls;

describe("새 캐릭터 그림 고르기", () => {
  it("side_part_hair_maps_to_part_asset", () => {
    expect(urls(a({ hair: "side-part" }), "idle")).toEqual([
      "/avatar2/idle/hair-part-back.webp",
      "/avatar2/idle/body-tee-s0.webp",
      "/avatar2/idle/hair-part-front.webp",
    ]);
    for (const h of AVATAR_OPTIONS.hair) expect(spriteLayers(a({ hair: h }), "running").hair).toBe(h === "side-part" ? "part" : h);
  });
  it("every_catalog_outfit_maps_to_a_body_asset_or_tee", () => {
    const meta = spriteMeta("idle");
    for (const o of OUTFITS) expect(meta.outfits, o.id).toContain(outfitAsset(a({ outfit: o.id }), meta));
    expect(outfitAsset(a({ outfit: "hoodie" }), meta)).toBe("hoodie");
    expect(outfitAsset(a({ outfit: "tank-joggers" }), meta)).toBe("tank-joggers");
    expect(outfitAsset(a({ outfit: "sports-bra-leggings" }), meta)).toBe("sports-bra-leggings");
    expect(outfitAsset(DEFAULT_AVATAR, meta)).toBe("tee");
  });
  it("unknown_outfit_or_missing_asset_falls_back_to_tee", () => {
    // 그림 목록에 없는 옷(예: 나중에 상점에만 먼저 생긴 옷) → 티
    const meta = { ...spriteMeta("gym"), outfits: ["tee", "hoodie"] };
    expect(outfitAsset(a({ outfit: "rashguard" }), meta)).toBe("tee");
    // 저장값이 깨져 있으면 기본 캐릭터
    expect(urls({ skin: 9, hair: "mohawk", shirt: 0 } as AvatarSpec, "idle")[1]).toBe("/avatar2/idle/body-tee-s0.webp");
  });
  it("jiujitsu_and_taekwondo_wear_uniforms", () => {
    for (const o of [undefined, "hoodie", "rashguard"]) {
      expect(spriteLayers(a({ outfit: o }), "jiujitsu").outfit).toBe("gi");
      expect(spriteLayers(a({ outfit: o }), "taekwondo").outfit).toBe("dobok");
    }
    expect(urls(a({ skin: 2 }), "jiujitsu")[1]).toBe("/avatar2/jiujitsu/body-gi-s2.webp");
  });
  it("skin_index_picks_body_file", () => {
    for (let s = 0; s < AVATAR_OPTIONS.skin.length; s++) expect(urls(a({ skin: s, outfit: "singlet" }), "running")[1]).toBe(`/avatar2/running/body-singlet-s${s}.webp`);
  });
  it("only_needed_layers_in_draw_order_props_only_for_gym", () => {
    for (const p of POSES) {
      const u = urls(a({ hair: "afro", outfit: "hoodie" }), p);
      expect(u[0]).toMatch(/hair-afro-back\.webp$/);
      expect(u[1]).toMatch(/\/body-[a-z-]+-s0\.webp$/);
      expect(u[2]).toMatch(/hair-afro-front\.webp$/);
      expect(u.length).toBe(p === "gym" ? 4 : 3);
      if (p === "gym") expect(u[3]).toBe("/avatar2/gym/props.webp");
    }
    // 아직 소품 그림이 없다: 소품을 껴도 그림 요청이 늘지 않는다
    expect(urls(a({ acc: ["cap", "glasses"] }), "idle")).toHaveLength(3);
  });
  it("future_shirt_colors_and_accessories_come_from_meta_lists", () => {
    const meta = { ...spriteMeta("idle"), outfits: [...spriteMeta("idle").outfits, "tee-coral"], accs: ["glasses"] };
    expect(outfitAsset(a({ shirt: 0 }), meta)).toBe("tee-coral");
    expect(outfitAsset(a({ shirt: 1 }), meta)).toBe("tee");
    // 산 옷을 입으면 색 티는 쓰지 않는다
    expect(outfitAsset(a({ shirt: 0, outfit: "hoodie" }), meta)).toBe("hoodie");
  });
  it("every_layer_file_listed_in_manifest_exists", () => {
    let n = 0;
    for (const p of POSES) {
      const m = SPRITE_MANIFEST[p];
      const dir = join(ROOT, "public/avatar2", p);
      for (const o of m.outfits) for (let s = 0; s < 4; s++, n++) expect(existsSync(join(dir, `body-${o}-s${s}.webp`)), `${p} ${o} ${s}`).toBe(true);
      for (const h of m.hairs) for (const side of ["back", "front"]) expect(existsSync(join(dir, `hair-${h}-${side}.webp`)), `${p} ${h}`).toBe(true);
      expect(existsSync(join(dir, "props.webp"))).toBe(m.props);
      expect(m.frames).toBe(3);
      expect(Math.abs(m.sw - 3 * m.fw)).toBeLessThanOrEqual(3);
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe("SpriteAvatar", () => {
  it("renders_one_svg_window_with_stacked_strips", () => {
    const h = renderToStaticMarkup(<SpriteAvatar spec={a({ hair: "bun", skin: 3 })} size={42} pose="gym" />);
    const doc = new DOMParser().parseFromString(h, "text/html");
    const svg = doc.querySelector("svg")!;
    expect(svg.getAttribute("class")).toBe("spr p-gym");
    expect(svg.getAttribute("viewBox")).toBe("0 0 304 400");
    expect(svg.getAttribute("style")).toContain("--fw:304px");
    const imgs = [...svg.querySelectorAll("image")];
    expect(imgs.map((i) => i.getAttribute("href"))).toEqual([
      "/avatar2/gym/hair-bun-back.webp",
      "/avatar2/gym/body-tee-s3.webp",
      "/avatar2/gym/hair-bun-front.webp",
      "/avatar2/gym/props.webp",
    ]);
    for (const i of imgs) {
      expect(i.getAttribute("width")).toBe("914");
      expect(i.getAttribute("height")).toBe("400");
      expect(i.getAttribute("decoding")).toBe("async");
    }
    // 요소 수 ≤ 5 (빌라 화면에 50명)
    expect(doc.querySelectorAll("svg, svg *").length).toBeLessThanOrEqual(5);
  });
  it("box_keeps_aspect_and_fits_old_avatar_size", () => {
    for (const p of POSES) {
      const m = spriteMeta(p);
      const b = spriteBox(p, 100);
      expect(b.w / b.h).toBeCloseTo(m.fw / m.fh, 5);
      expect(b.w).toBeLessThanOrEqual(150 + 1e-9);
      expect(b.h).toBeLessThanOrEqual(180 + 1e-9);
      expect(b.floor).toBeLessThanOrEqual(b.h);
      // 원본(400px)보다 크게 그리지 않는다 (2배 화면에서도 흐리지 않게: 방 캐릭터 크기 ≤ 100)
      expect(b.h * 2).toBeLessThanOrEqual(m.fh);
    }
    // 서 있는 기본 자세 높이 = 옛 캐릭터의 발까지 높이
    expect(spriteBox("idle", 100).h).toBeCloseTo(140 * (155 / 168), 5);
  });
});

describe("sprite.css", () => {
  const dur = (p: Pose) => {
    const m = css.match(new RegExp(`\\.spr\\.p-${p} image[^{]*\\{[^}]*animation-duration: calc\\(([\\d.]+)s`));
    return m ? Number(m[1]) : null;
  };
  it("steps_through_frames_ping_pong", () => {
    expect(css).toMatch(/animation: spr-pp [^;]*step-end infinite/);
    const pp = css.match(/@keyframes spr-pp \{([^]*?)\n\}/)![1];
    expect([...pp.matchAll(/(\d+)% \{ transform: translateX\(([^)]*\)?)\)/g)].map((m) => m[1])).toEqual(["0", "25", "50", "75", "100"]);
    expect(pp).toMatch(/25% \{ transform: translateX\(calc\(var\(--fw\) \* -1\)\)/);
    expect(pp).toMatch(/50% \{ transform: translateX\(calc\(var\(--fw\) \* -2\)\)/);
    expect(pp).toMatch(/75% \{ transform: translateX\(calc\(var\(--fw\) \* -1\)\)/);
  });
  it("per_pose_timing_matches_frame_steps", () => {
    for (const p of POSES) {
      const d = dur(p) ?? css.match(/\.spr image \{ animation: spr-pp calc\(([\d.]+)s/)![1];
      expect(Number(d), p).toBeCloseTo(cycleSeconds(p), 5);
    }
    expect(cycleSeconds("running") / 4).toBeCloseTo(0.16, 5);
    expect(css).toMatch(/\.spr\.p-gym image \{ animation-name: spr-gym;/);
    // 헬스: 위 칸(2)에서 더 오래 버틴다
    const g = FRAME_STEPS.gym;
    expect(g[2]).toBeGreaterThan(g[0]);
    const total = cycleSeconds("gym");
    let at = 0;
    const marks = g.map((s) => ((at += s), ((at - s) / total) * 100).toFixed(3));
    const gk = css.match(/@keyframes spr-gym \{([^]*?)\n\}/)![1];
    for (const m of marks.slice(1)) expect(gk).toContain(`${m}% {`);
  });
  it("reduced_motion_keeps_animating_1_6x_slower", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.spr \{ --t: 1\.6; \}/);
    expect(css).not.toMatch(/animation: none/);
    for (const p of POSES) if (dur(p) !== null) expect(css).toMatch(new RegExp(`p-${p} image[^}]*\\* var\\(--t\\)`));
  });
});
