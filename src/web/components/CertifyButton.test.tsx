// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CertifyButton } from "./CertifyButton";

const html = (certified: boolean) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <CertifyButton certifiedToday={certified} />
    </MemoryRouter>,
  );

describe("CertifyButton", () => {
  it("primary_before_first_photo", () => {
    const h = html(false);
    expect(h).toContain("오늘 오운완 인증하기");
    expect(h).toContain('href="/certify"');
    expect(h).toContain("btn primary");
    expect(h).not.toContain("추가 인증하기");
  });

  it("ghost_after_certified_still_reaches_certify", () => {
    const h = html(true);
    expect(h).toContain("추가 인증하기");
    expect(h).toContain('href="/certify"');
    expect(h).toContain("btn ghost");
    expect(h).not.toContain("오늘 오운완 인증하기");
  });

  it("certified_in_another_villa_offers_this_villa_too", () => {
    const h = renderToStaticMarkup(
      <MemoryRouter>
        <CertifyButton certifiedToday={false} certifiedElsewhere villaId="B" />
      </MemoryRouter>,
    );
    expect(h).toContain("이 아파트에도 올리기");
    expect(h).toContain('href="/certify?villa=B"');
    expect(h).not.toContain("오늘 오운완 인증하기");
  });
});
