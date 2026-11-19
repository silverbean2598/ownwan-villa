// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { LandingView } from "../../pages/Landing";
import { KakaoButton, kakaoStartHref } from "./KakaoButton";
import { KakaoSection, type KakaoStatus } from "./KakaoSection";

const section = (status: KakaoStatus, notice?: string) =>
  renderToStaticMarkup(<KakaoSection status={status} notice={notice} onChanged={() => {}} />);

describe("카카오 버튼", () => {
  it("landing_logged_out_shows_kakao_button_with_other_buttons", () => {
    const h = renderToStaticMarkup(<MemoryRouter><LandingView me={null} /></MemoryRouter>);
    expect(h).toContain("카카오로 시작하기");
    expect(h).toContain('href="/api/auth/kakao/start?mode=login"');
    expect(h).toContain('class="btn kakao"');
    // 기존 버튼도 그대로
    expect(h).toContain('href="/signup"');
    expect(h).toContain('href="/login"');
    const cta = h.slice(h.indexOf("lp-cta"), h.indexOf("lp-villa"));
    expect(cta).toContain("카카오로 시작하기");
  });

  it("landing_logged_in_hides_kakao_button", () => {
    const h = renderToStaticMarkup(<MemoryRouter><LandingView me={{ villaId: "v1" }} /></MemoryRouter>);
    expect(h).not.toContain("카카오로 시작하기");
  });

  it("start_href_carries_mode_and_next", () => {
    expect(kakaoStartHref("link")).toBe("/api/auth/kakao/start?mode=link");
    expect(kakaoStartHref("login", "/join/abc")).toBe("/api/auth/kakao/start?mode=login&next=%2Fjoin%2Fabc");
    expect(renderToStaticMarkup(<KakaoButton label="카카오로 로그인" />)).toContain("카카오로 로그인");
  });
});

describe("설정 → 카카오 연결 세 가지 상태", () => {
  it("not_linked_shows_link_button", () => {
    const h = section({ configured: true, linked: false, hasPassword: true });
    expect(h).toContain('data-kakao-state="unlinked"');
    expect(h).toContain("카카오 연결하기");
    expect(h).toContain('href="/api/auth/kakao/start?mode=link"');
    expect(h).not.toContain("연결 해제");
  });

  it("not_linked_and_not_configured_says_preparing", () => {
    const h = section({ configured: false, linked: false, hasPassword: true });
    expect(h).toContain("카카오 로그인을 준비 중이에요");
    expect(h).not.toContain("카카오 연결하기");
  });

  it("linked_with_password_shows_unlink", () => {
    const h = section({ configured: true, linked: true, hasPassword: true });
    expect(h).toContain('data-kakao-state="linked"');
    expect(h).toContain("연결 해제");
    expect(h).not.toContain("카카오 연결하기");
  });

  it("kakao_only_is_read_only_explanation", () => {
    const h = section({ configured: true, linked: true, hasPassword: false });
    expect(h).toContain('data-kakao-state="kakao-only"');
    expect(h).toContain("카카오로 가입한 계정");
    expect(h).toContain("연결은 해제할 수 없어요");
    expect(h).not.toContain("<button");
    expect(h).not.toContain("카카오 연결하기");
  });

  it("callback_notice_is_shown", () => {
    expect(section({ configured: true, linked: false, hasPassword: true }, "linked_other")).toContain(
      "이 카카오 계정은 다른 오운완빌라 계정에 연결돼 있어요",
    );
    expect(section({ configured: true, linked: true, hasPassword: true }, "linked")).toContain("카카오를 연결했어요");
  });
});
