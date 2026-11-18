// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, POSES, type Pose } from "./Avatar";
import { AVATAR_OPTIONS, DEFAULT_AVATAR, type AvatarSpec } from "../../shared/avatar";
import { OUTFITS } from "../../shared/catalog";
import { BUN, SW } from "./avatar/parts";

// 2D 아핀 행렬 [a b c d e f] (SVG matrix 순서)
type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const R = (deg: number, cx = 0, cy = 0): M => {
  const r = (deg * Math.PI) / 180;
  return mul(mul(T(cx, cy), [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), T(-cx, -cy));
};
/** transform 속성 문자열(translate · rotate · scale)을 행렬로 */
function parseTransform(src: string): M {
  let m: M = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of src.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(parseFloat);
    if (fn === "translate") m = mul(m, T(v[0], v[1] ?? 0));
    else if (fn === "rotate") m = mul(m, R(v[0], v[1] ?? 0, v[2] ?? 0));
    else if (fn === "scale") m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
  }
  return m;
}
/** 요소에서 svg 루트까지 transform 속성과 관절 style(rotate + transform-origin)을 합성 */
function ctm(el: Element): M {
  let m: M = [1, 0, 0, 1, 0, 0];
  for (let e: Element | null = el; e && e.tagName.toLowerCase() !== "svg"; e = e.parentElement) {
    let own: M = parseTransform(e.getAttribute("transform") ?? "");
    const st = (e as SVGElement).style;
    if (st?.transform) {
      const [ox, oy] = st.transformOrigin.split(/\s+/).map(parseFloat);
      own = mul(R(parseFloat(st.transform.match(/rotate\(([-\d.]+)deg\)/)![1]), ox, oy), own);
    }
    m = mul(own, m);
  }
  return m;
}

describe("Avatar", () => {
  it("idle_has_open_eyes_and_no_z", () => {
    const h = renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} />);
    expect(h).toContain('role="img"');
    expect(h).not.toContain(">z<");
  });
  it("sleep_shows_z", () => {
    expect(renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} pose="sleep" className="x" />)).toContain(">z<");
  });
  it("falls_back_on_bad_spec", () => {
    expect(() => renderToStaticMarkup(<Avatar spec={{ skin: 9, hair: "?", shirt: 99 }} size={40} />)).not.toThrow();
  });

  it("every_pose_renders_for_every_hair", () => {
    const poses: Pose[] = ["idle", "sleep", "gym", "running", "pilates", "climbing", "jiujitsu", "taekwondo"];
    expect(Object.keys(POSES).sort()).toEqual([...poses].sort());
    for (const pose of poses)
      for (const hair of AVATAR_OPTIONS.hair) {
        const h = renderToStaticMarkup(<Avatar spec={{ ...DEFAULT_AVATAR, hair }} size={40} pose={pose} />);
        expect(h).toContain(`data-hair="${hair}"`);
        expect(h).toContain(`pose-${pose}`);
      }
  });

  it("rig_has_separate_jointed_parts", () => {
    const h = renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} pose="running" />);
    for (const part of ["head", "torso", "armL", "armR", "legL", "legR"]) expect(h).toContain(`data-part="${part}"`);
  });

  it("jiujitsu_wears_gi_instead_of_tee", () => {
    const jj = renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} pose="jiujitsu" />);
    expect(jj).toContain('data-part="gi"');
    expect(jj).not.toContain('data-part="tee"');
    const idle = renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} />);
    expect(idle).toContain('data-part="tee"');
    expect(idle).not.toContain('data-part="gi"');
  });

  it("taekwondo_wears_v_neck_dobok_and_differs_from_jiujitsu", () => {
    const tk = renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} pose="taekwondo" />);
    expect(tk).toContain('data-part="dobok"');
    expect(tk).not.toContain('data-part="gi"');
    expect(tk).not.toContain('data-part="tee"');
    expect(tk).not.toContain('data-part="dummy"');
  });

  it("jiujitsu_is_closed_guard_with_dummy", () => {
    const jj = renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} pose="jiujitsu" />);
    expect(jj).toContain('data-part="gi"');
    expect(jj).toContain('data-part="dummy"');
    expect(jj).not.toContain('data-part="dobok"');
  });

  it("shirt_fill_uses_selected_color", () => {
    AVATAR_OPTIONS.shirt.forEach((c, i) => {
      const h = renderToStaticMarkup(<Avatar spec={{ ...DEFAULT_AVATAR, shirt: i }} size={40} />);
      expect(h).toMatch(new RegExp(`data-part="tee"[^>]*fill="${c}"|fill="${c}"[^>]*data-part="tee"`));
    });
  });

  it("every_pose_uses_zero_origin_viewbox_so_joint_pivots_match_in_all_engines", () => {
    for (const pose of Object.keys(POSES) as Pose[]) {
      const h = renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} pose={pose} />);
      expect(h.match(/<svg[^>]*viewBox="([^"]*)"/)![1]).toMatch(/^0 0 /);
    }
  });

  it("gym_pose_holds_barbell", () => {
    expect(renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} pose="gym" />)).toContain('data-part="barbell"');
  });

  it("bun_stays_inside_viewbox_and_on_head_in_every_pose", () => {
    for (const pose of Object.keys(POSES) as Pose[]) {
      const html = renderToStaticMarkup(<Avatar spec={{ ...DEFAULT_AVATAR, hair: "bun" }} size={120} pose={pose} />);
      const svg = new DOMParser().parseFromString(html, "image/svg+xml").documentElement;
      const [, , w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
      const circle = svg.querySelector('[data-part="bun"] circle')!;
      expect(circle, pose).toBeTruthy();
      // 외곽선이 있는 동그란 똥머리
      expect(circle.getAttribute("stroke"), pose).toBeTruthy();
      expect(Number(circle.getAttribute("cx"))).toBe(BUN.cx);
      // 머리 그룹 안에 있어야 머리와 같이 움직인다
      expect(circle.closest('[data-part="head"]'), pose).toBeTruthy();
      const m = ctm(circle);
      const x = m[0] * BUN.cx + m[2] * BUN.cy + m[4];
      const y = m[1] * BUN.cx + m[3] * BUN.cy + m[5];
      const r = BUN.r + SW / 2;
      expect(x - r, `${pose} left`).toBeGreaterThanOrEqual(0);
      expect(y - r, `${pose} top`).toBeGreaterThanOrEqual(0);
      expect(x + r, `${pose} right`).toBeLessThanOrEqual(w);
      expect(y + r, `${pose} bottom`).toBeLessThanOrEqual(h);
    }
  });

  // ---------- 꾸미기 확장 ----------
  const parse = (spec: AvatarSpec, pose: Pose = "idle") =>
    new DOMParser().parseFromString(renderToStaticMarkup(<Avatar spec={spec} size={120} pose={pose} />), "image/svg+xml").documentElement;
  const ACC_SETS = [["headband", "glasses", "earphones", "towel", "wristbands"], ["cap", "glasses"], ["cap", "towel", "wristbands"]];

  it("every_pose_x_outfit_x_accessories_renders_with_zero_origin_viewbox", () => {
    for (const pose of Object.keys(POSES) as Pose[])
      for (const outfit of [undefined, ...OUTFITS.map((o) => o.id)])
        for (const acc of ACC_SETS) {
          const svg = parse({ ...DEFAULT_AVATAR, hair: "ponytail", outfit, acc }, pose);
          expect(svg.getAttribute("viewBox"), `${pose} ${outfit}`).toMatch(/^0 0 /);
          const gi = POSES[pose].uniform;
          expect(svg.getAttribute("data-outfit"), `${pose} ${outfit}`).toBe(gi ?? outfit ?? "tee");
        }
  });

  it("outfits_are_drawn_in_body_parts_and_tinted_with_shirt_color", () => {
    for (const { id } of OUTFITS) {
      const svg = parse({ ...DEFAULT_AVATAR, shirt: 2, outfit: id });
      const top = svg.querySelector(`[data-part="outfit-${id}"] [data-part="top"]`)!;
      expect(top, id).toBeTruthy();
      expect(top.getAttribute("fill")).toBe(AVATAR_OPTIONS.shirt[2]);
      expect(top.closest('[data-part="torso"]')).toBeTruthy();
      expect(svg.querySelector('[data-part="tee"]'), id).toBeNull();
    }
  });

  it("jiujitsu_and_taekwondo_keep_their_uniform_over_bought_outfit", () => {
    expect(parse({ ...DEFAULT_AVATAR, outfit: "hoodie" }, "jiujitsu").querySelector('[data-part="gi"]')).toBeTruthy();
    expect(parse({ ...DEFAULT_AVATAR, outfit: "hoodie" }, "taekwondo").querySelector('[data-part="dobok"]')).toBeTruthy();
    expect(parse({ ...DEFAULT_AVATAR, outfit: "hoodie" }, "taekwondo").querySelector('[data-part="outfit-hoodie"]')).toBeNull();
  });

  it("accessories_follow_their_joint_in_every_pose", () => {
    const where: [string, string][] = [
      ["headband", "head"], ["glasses", "head"], ["earphones", "upper"], ["towel", "upper"],
    ];
    for (const pose of Object.keys(POSES) as Pose[]) {
      const svg = parse({ ...DEFAULT_AVATAR, acc: ["headband", "glasses", "earphones", "towel", "wristbands"] }, pose);
      for (const [part, joint] of where) expect(svg.querySelector(`[data-part="${part}"]`)?.closest(`[data-part="${joint}"]`), `${pose} ${part}`).toBeTruthy();
      // 손목 밴드는 양쪽 아래팔 그룹 안에서 손과 같이 움직인다
      const bands = [...svg.querySelectorAll('[data-part="wristband"]')];
      expect(bands.map((b) => b.closest('[data-part^="fore"]')?.getAttribute("data-part")).sort(), pose).toEqual(["foreL", "foreR"]);
    }
  });

  it("cap_hides_under_beanie_and_glasses_hide_for_sunglasses", () => {
    expect(parse({ ...DEFAULT_AVATAR, acc: ["cap"] }).querySelector('[data-part="cap"]')).toBeTruthy();
    expect(parse({ ...DEFAULT_AVATAR, hair: "beanie", acc: ["cap"] }).querySelector('[data-part="cap"]')).toBeNull();
    expect(parse({ ...DEFAULT_AVATAR, hair: "beanie", acc: ["cap"] }).querySelector('[data-part="beanie"]')).toBeTruthy();
    const cool = new DOMParser().parseFromString(renderToStaticMarkup(<Avatar spec={{ ...DEFAULT_AVATAR, acc: ["glasses"] }} size={40} face="cool" />), "image/svg+xml");
    expect(cool.querySelector('[data-part="glasses"]')).toBeNull();
  });

  it("beanie_takes_shirt_color", () => {
    const svg = parse({ ...DEFAULT_AVATAR, hair: "beanie", shirt: 0 });
    expect(svg.querySelector('[data-part="beanie"] path')!.getAttribute("fill")).toBe(AVATAR_OPTIONS.shirt[0]);
  });
});

