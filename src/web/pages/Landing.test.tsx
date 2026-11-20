// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { LandingView } from "./Landing";

const render = (me: { villaId: string | null } | null) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <LandingView me={me} />
    </MemoryRouter>,
  );

describe("Landing", () => {
  it("logged_out_shows_signup_and_login", () => {
    const h = render(null);
    expect(h).toContain('href="/signup"');
    expect(h).toContain("가입하고 입주하기");
    expect(h).toContain('href="/login"');
    expect(h).not.toContain("내 빌라로");
  });
  it("cta_comes_before_villa_illustration", () => {
    const h = render(null);
    expect(h.indexOf("lp-cta")).toBeGreaterThan(h.indexOf("lp-tagline"));
    expect(h.indexOf("lp-cta")).toBeLessThan(h.indexOf("lp-villa"));
  });
  it("logged_in_with_villa_goes_to_villa", () => {
    const h = render({ villaId: "v1" });
    expect(h).toContain('href="/villa"');
    expect(h).toContain("내 빌라로");
    expect(h).not.toContain('href="/signup"');
  });
  it("logged_in_without_villa_creates_one", () => {
    const h = render({ villaId: null });
    expect(h).toContain('href="/villa/new"');
    expect(h).toContain("빌라 만들기");
  });
  it("explains_three_steps_with_art_and_legal_links", () => {
    const h = render(null);
    expect(h).toContain("이렇게 놀아요");
    expect((h.match(/class="lp-step"/g) ?? []).length).toBe(3);
    // 그림 캐릭터: 빌라 단면 · 꺼진 방은 잠 그림, 펜트하우스는 만세 + 왕관. 옛 svg 캐릭터는 없다
    expect(h).toContain('class="spr p-sleep"');
    expect(h).toContain('class="spr p-cheer"');
    expect(h).toContain('data-part="crown"');
    expect(h).not.toContain('class="av ');
    expect(h).toContain('href="/terms"');
    expect(h).toContain('href="/privacy"');
  });
});
