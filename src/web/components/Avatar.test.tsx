// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar } from "./Avatar";
import { DEFAULT_AVATAR } from "../../shared/avatar";

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
});
