// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AccountDelete } from "./AccountDelete";
import { Privacy } from "./Privacy";

const html = (el: JSX.Element) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);

describe("AccountDelete", () => {
  it("explains_steps_and_deleted_data_without_login", () => {
    const h = html(<AccountDelete />);
    expect(h).toContain("오운완아파트 계정 삭제");
    expect(h).toContain("탈퇴");
    expect(h).toContain("식단 사진");
    expect(h).toContain('href="/settings"');
  });

  it("privacy_links_to_account_delete_and_lists_meals", () => {
    const h = html(<Privacy />);
    expect(h).toContain('href="/account-delete"');
    expect(h).toContain("식단 사진");
    expect(h).toContain("개인정보 보호책임자");
  });
});
