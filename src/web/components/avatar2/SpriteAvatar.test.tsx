// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { SpriteAvatar } from "./SpriteAvatar";
import { FRAME_STEPS, SHIRT_ASSET, cycleSeconds, outfitAsset, spriteBox, spriteLayers, spriteMeta, spriteRes } from "./layers";
import { SPRITE_MANIFEST, SPRITE_SM_H } from "./manifest";
import { AVATAR_OPTIONS, DEFAULT_AVATAR, type AvatarSpec } from "../../../shared/avatar";
import { ACCESSORIES, OUTFITS } from "../../../shared/catalog";
import type { Pose } from "./pose";

const ROOT = join(__dirname, "../../../..");
const POSES: Pose[] = ["idle", "sleep", "gym", "running", "pilates", "climbing", "jiujitsu", "taekwondo", "cheer", "sad"];
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
    expect(urls(a({ hair: "side-part" }), "taekwondo")).toEqual(["/avatar2/taekwondo/body-dobok-part-s0.webp"]);
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
  it("jiujitsu_and_taekwondo_wear_uniforms_with_hair_baked_in", () => {
    for (const o of [undefined, "hoodie", "rashguard"]) {
      expect(spriteLayers(a({ outfit: o }), "jiujitsu").outfit).toBe("gi-short");
      expect(spriteLayers(a({ outfit: o }), "taekwondo").outfit).toBe("dobok-short");
    }
    // 머리 층 없이 몸(머리 포함) 하나 + 소품
    expect(urls(a({ skin: 2, hair: "afro" }), "jiujitsu")).toEqual(["/avatar2/jiujitsu/body-gi-afro-s2.webp"]);
    expect(urls(a({ hair: "bun", acc: ["glasses", "towel"] }), "taekwondo")).toEqual([
      "/avatar2/taekwondo/body-dobok-bun-s0.webp",
      "/avatar2/taekwondo/acc-glasses.webp",
      "/avatar2/taekwondo/acc-towel.webp",
    ]);
    expect(spriteLayers(a({ hair: "wolf" }), "jiujitsu", "sm").urls).toEqual(["/avatar2/jiujitsu/sm/body-gi-wolf-s0.webp"]);
    for (const p of ["jiujitsu", "taekwondo"] as const) {
      const m = spriteMeta(p);
      expect(m.fullHair).toBe(true);
      expect(m.hairs).toEqual([]);
      for (const h of AVATAR_OPTIONS.hair) {
        const l = spriteLayers(a({ hair: h }), p);
        expect(l.hair).toBe("");
        expect(l.outfit, `${p} ${h}`).toBe(`${m.outfits[0]}-${h === "side-part" ? "part" : h}`);
        expect(l.urls.some((u) => u.includes("/hair-"))).toBe(false);
      }
      // 머리 그림이 없으면 민머리 도복
      expect(outfitAsset(a({ hair: "afro" }), { ...m, outfits: [m.outfits[0]] })).toBe(m.outfits[0]);
    }
  });
  it("skin_index_picks_body_file", () => {
    for (let s = 0; s < AVATAR_OPTIONS.skin.length; s++) expect(urls(a({ skin: s, outfit: "singlet" }), "running")[1]).toBe(`/avatar2/running/body-singlet-s${s}.webp`);
  });
  it("only_needed_layers_in_draw_order_props_only_for_gym", () => {
    for (const p of POSES) {
      const u = urls(a({ hair: "afro", outfit: "hoodie" }), p);
      if (spriteMeta(p).fullHair) {
        expect(u).toEqual([`/avatar2/${p}/body-${p === "jiujitsu" ? "gi" : "dobok"}-afro-s0.webp`]);
        continue;
      }
      expect(u[0]).toMatch(/hair-afro-back\.webp$/);
      expect(u[1]).toMatch(/\/body-[a-z-]+-s0\.webp$/);
      expect(u[2]).toMatch(/hair-afro-front\.webp$/);
      expect(u.length).toBe(p === "gym" ? 4 : 3);
      if (p === "gym") expect(u[3]).toBe("/avatar2/gym/props.webp");
    }
  });
  it("accessory_layers_drawn_after_front_hair_before_props_in_fixed_order", () => {
    // 몸 자리마다 하나씩 다 낀다 (헤어밴드 대신 모자)
    const all = ["wristbands", "towel", "glasses", "cap", "earphones"];
    expect(urls(a({ hair: "bun", acc: all }), "gym")).toEqual([
      "/avatar2/gym/hair-bun-back.webp",
      "/avatar2/gym/body-tee-s0.webp",
      "/avatar2/gym/hair-bun-front.webp",
      "/avatar2/gym/acc-cap.webp",
      "/avatar2/gym/acc-glasses.webp",
      "/avatar2/gym/acc-earphones.webp",
      "/avatar2/gym/acc-towel.webp",
      "/avatar2/gym/acc-wristbands.webp",
      "/avatar2/gym/props.webp",
    ]);
    for (const p of POSES) {
      expect(spriteMeta(p).accs, p).toEqual(ACCESSORIES.map((x) => x.id));
      const at = spriteMeta(p).fullHair ? 1 : 3;
      for (const x of ACCESSORIES) expect(urls(a({ acc: [x.id] }), p)[at], `${p} ${x.id}`).toBe(`/avatar2/${p}/acc-${x.id}.webp`);
    }
    expect(spriteLayers(a({ acc: ["glasses", "headband"] }), "idle").acc).toEqual(["headband", "glasses"]);
  });
  it("beanie_hides_cap_and_headband_and_broken_acc_lists_draw_none", () => {
    expect(spriteLayers(a({ hair: "beanie", acc: ["cap", "glasses"] }), "idle").acc).toEqual(["glasses"]);
    expect(spriteLayers(a({ hair: "beanie", acc: ["headband"] }), "running").urls).toHaveLength(3);
    // 같은 자리 소품 두 개(저장값이 깨짐) → parseAvatar 가 거부해 기본 캐릭터
    expect(spriteLayers(a({ acc: ["cap", "headband"] }), "idle").acc).toEqual([]);
  });
  it("shirt_color_picks_colored_tee_only_without_shop_outfit", () => {
    expect(SHIRT_ASSET).toEqual(["tee-coral", "tee-orange", "tee-yellow", "tee-mint", "tee", "tee-navy", "tee-lavender", "tee-charcoal"]);
    expect(SHIRT_ASSET).toHaveLength(AVATAR_OPTIONS.shirt.length);
    for (const p of POSES) {
      const meta = spriteMeta(p);
      for (let i = 0; i < AVATAR_OPTIONS.shirt.length; i++) {
        const uniform = p === "jiujitsu" ? "gi-short" : p === "taekwondo" ? "dobok-short" : null;
        expect(outfitAsset(a({ shirt: i }), meta), `${p} ${i}`).toBe(uniform ?? SHIRT_ASSET[i]);
        // 산 옷을 입으면 색 티는 쓰지 않는다
        expect(outfitAsset(a({ shirt: i, outfit: "hoodie" }), meta)).toBe(uniform ?? "hoodie");
      }
    }
    expect(urls(a({ shirt: 0, skin: 1 }), "idle")[1]).toBe("/avatar2/idle/body-tee-coral-s1.webp");
    expect(urls(a({ shirt: 7 }), "running")[1]).toBe("/avatar2/running/body-tee-charcoal-s0.webp");
    expect(urls(a({ shirt: 4 }), "idle")[1]).toBe("/avatar2/idle/body-tee-s0.webp");
    // 색 그림이 없는 자세(예전 meta) → 기본 티
    expect(outfitAsset(a({ shirt: 0 }), { ...spriteMeta("idle"), outfits: ["tee", "hoodie"] })).toBe("tee");
  });
  it("small_sprites_when_drawn_at_most_160_device_px", () => {
    expect(spriteRes(80, 2)).toBe("sm");
    expect(spriteRes(160, 1)).toBe("sm");
    expect(spriteRes(81, 2)).toBe("full");
    expect(spriteRes(60, 3)).toBe("full");
    expect(spriteRes(155, 2)).toBe("full");
    expect(spriteRes(0, 2)).toBe("full");
    expect(spriteRes(100, 0)).toBe("sm");
    const sm = spriteLayers(a({ hair: "wolf", acc: ["towel"] }), "gym", "sm");
    expect(sm.urls).toEqual([
      "/avatar2/gym/sm/hair-wolf-back.webp",
      "/avatar2/gym/sm/body-tee-s0.webp",
      "/avatar2/gym/sm/hair-wolf-front.webp",
      "/avatar2/gym/sm/acc-towel.webp",
      "/avatar2/gym/sm/props.webp",
    ]);
    // 작은 띠도 원본 배율로 늘려 칸 경계가 같다
    for (const p of POSES) {
      const m = spriteMeta(p);
      const w = spriteLayers(DEFAULT_AVATAR, p, "sm").stripW;
      expect(w / m.fh).toBeCloseTo(m.smSw / SPRITE_SM_H, 9);
      expect(Math.abs(w - m.sw)).toBeLessThanOrEqual(1.5);
      expect(spriteLayers(DEFAULT_AVATAR, p).stripW).toBe(m.sw);
    }
  });
  it("every_layer_file_listed_in_manifest_exists", () => {
    let n = 0;
    for (const p of POSES) {
      const m = SPRITE_MANIFEST[p];
      const dir = join(ROOT, "public/avatar2", p);
      for (const o of m.outfits) for (let s = 0; s < 4; s++, n++) expect(existsSync(join(dir, `body-${o}-s${s}.webp`)), `${p} ${o} ${s}`).toBe(true);
      for (const h of m.hairs) for (const side of ["back", "front"]) expect(existsSync(join(dir, `hair-${h}-${side}.webp`)), `${p} ${h}`).toBe(true);
      if (m.fullHair) {
        // 머리가 몸 그림에 있다: 모든 머리 × 피부 몸 그림이 있고 머리 층 그림은 없다
        for (const h of AVATAR_OPTIONS.hair)
          for (let s = 0; s < 4; s++) expect(existsSync(join(dir, `body-${m.outfits[0]}-${h === "side-part" ? "part" : h}-s${s}.webp`)), `${p} ${h} ${s}`).toBe(true);
        expect(readdirSync(dir).some((f) => f.startsWith("hair-")), p).toBe(false);
      } else expect(m.hairs.length, p).toBeGreaterThan(0);
      for (const x of m.accs) expect(existsSync(join(dir, `acc-${x}.webp`)), `${p} acc ${x}`).toBe(true);
      expect(existsSync(join(dir, "props.webp"))).toBe(m.props);
      // sm/ 에 같은 이름 그림이 다 있다
      const names = readdirSync(dir).filter((f) => f.endsWith(".webp")).sort();
      expect(readdirSync(join(dir, "sm")).filter((f) => f.endsWith(".webp")).sort(), p).toEqual(names);
      expect(m.smSw).toBe(Math.round((m.sw * SPRITE_SM_H) / m.fh));
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
    expect(svg.getAttribute("viewBox")).toBe("0 0 305 400");
    expect(svg.getAttribute("style")).toContain("--fw:305px");
    const imgs = [...svg.querySelectorAll("image")];
    expect(imgs.map((i) => i.getAttribute("href"))).toEqual([
      "/avatar2/gym/hair-bun-back.webp",
      "/avatar2/gym/body-tee-s3.webp",
      "/avatar2/gym/hair-bun-front.webp",
      "/avatar2/gym/props.webp",
    ]);
    for (const i of imgs) {
      expect(i.getAttribute("width")).toBe("916");
      expect(i.getAttribute("height")).toBe("400");
      expect(i.getAttribute("decoding")).toBe("async");
    }
    // 요소 수 ≤ 5 (빌라 화면에 50명)
    expect(doc.querySelectorAll("svg, svg *").length).toBeLessThanOrEqual(5);
  });
  it("accessory_adds_one_image_per_worn_item", () => {
    const h = renderToStaticMarkup(<SpriteAvatar spec={a({ acc: ["glasses"] })} size={42} pose="idle" />);
    const doc = new DOMParser().parseFromString(h, "text/html");
    expect([...doc.querySelectorAll("image")].map((i) => i.getAttribute("href"))).toEqual([
      "/avatar2/idle/hair-short-back.webp",
      "/avatar2/idle/body-tee-s0.webp",
      "/avatar2/idle/hair-short-front.webp",
      "/avatar2/idle/acc-glasses.webp",
    ]);
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
