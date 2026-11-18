// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, POSES, type Pose } from "./Avatar";
import { AVATAR_OPTIONS, DEFAULT_AVATAR } from "../../shared/avatar";

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
    const poses: Pose[] = ["idle", "sleep", "gym", "running", "pilates", "climbing", "jiujitsu"];
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

  it("shirt_fill_uses_selected_color", () => {
    AVATAR_OPTIONS.shirt.forEach((c, i) => {
      const h = renderToStaticMarkup(<Avatar spec={{ ...DEFAULT_AVATAR, shirt: i }} size={40} />);
      expect(h).toMatch(new RegExp(`data-part="tee"[^>]*fill="${c}"|fill="${c}"[^>]*data-part="tee"`));
    });
  });

  it("gym_pose_holds_barbell", () => {
    expect(renderToStaticMarkup(<Avatar spec={DEFAULT_AVATAR} size={40} pose="gym" />)).toContain('data-part="barbell"');
  });
});
