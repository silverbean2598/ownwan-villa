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
});
