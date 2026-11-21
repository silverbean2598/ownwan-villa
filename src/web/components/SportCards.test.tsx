// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SportCards } from "./SportCards";
import { DEFAULT_AVATAR } from "../../shared/avatar";

describe("SportCards (온보딩 · 설정 종목 고르기)", () => {
  it("offers_eight_sports_with_their_own_pose", () => {
    const h = renderToStaticMarkup(<SportCards value="yoga" avatar={DEFAULT_AVATAR} onChange={() => {}} />);
    const doc = new DOMParser().parseFromString(h, "text/html");
    const cards = [...doc.querySelectorAll('[role="radio"]')];
    expect(cards.map((c) => c.textContent)).toEqual(["헬스", "필라테스", "요가", "홈트", "러닝", "클라이밍", "주짓수", "태권도"]);
    expect(cards.find((c) => c.getAttribute("aria-checked") === "true")!.textContent).toBe("요가");
    for (const p of ["pilates", "yoga", "hometraining"]) expect(h).toContain(`/avatar2/${p}/`);
  });
});
