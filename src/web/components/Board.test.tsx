// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Board, groupByDay, tiltFor, type BoardItemData } from "./Board";

const photo = (id: string, n: number, extra: Partial<BoardItemData> = {}): BoardItemData => ({
  id, kind: "photo", day: "2026-11-18", hidden: false, createdAt: 1000 - n, photoUrl: `/api/photos/${id}`, ...extra,
});
const routine = (id: string, n: number, extra: Partial<BoardItemData> = {}): BoardItemData => ({
  id, kind: "routine", day: "2026-11-17", hidden: false, createdAt: 1000 - n, body: "스쿼트 5x5", ...extra,
});
const count = (html: string, cls: string) => html.split(`class="${cls}`).length - 1;

describe("Board", () => {
  it("renders_polaroids_and_sticky_notes_in_order", () => {
    const html = renderToStaticMarkup(<Board items={[photo("a", 0), routine("r", 1), photo("b", 2)]} />);
    expect(count(html, "polaroid")).toBe(2);
    expect(count(html, "sticky")).toBe(1);
    expect(html.indexOf("/api/photos/a")).toBeLessThan(html.indexOf("스쿼트"));
    expect(html.indexOf("스쿼트")).toBeLessThan(html.indexOf("/api/photos/b"));
    expect(html).toContain("11/18");
  });
  it("room_mode_caps_at_6", () => {
    const items = Array.from({ length: 9 }, (_, i) => photo("p" + i, i));
    expect(count(renderToStaticMarkup(<Board items={items} />), "polaroid")).toBe(6);
  });
  it("hidden_photo_and_routine_placeholders", () => {
    const html = renderToStaticMarkup(
      <Board items={[photo("h", 0, { hidden: true, photoUrl: undefined }), routine("g", 1, { hidden: true, body: undefined })]} />,
    );
    expect(html).toContain("가려진 사진");
    expect(html).toContain("가려진 기록");
    expect(html).not.toContain("<img");
  });
  it("empty_state", () => {
    expect(renderToStaticMarkup(<Board items={[]} />)).toContain("아직 붙인 기록이 없어요");
  });
  it("rotation_is_deterministic_per_id", () => {
    expect(tiltFor("abc")).toBe(tiltFor("abc"));
    expect(Math.abs(tiltFor("abc"))).toBeLessThanOrEqual(4);
    const a = renderToStaticMarkup(<Board items={[photo("abc", 0)]} />);
    const b = renderToStaticMarkup(<Board items={[photo("abc", 0)]} />);
    expect(a).toBe(b);
  });
  it("photo_actions_slot", () => {
    const html = renderToStaticMarkup(<Board items={[photo("a", 0)]} renderPhotoActions={(i) => <i>act-{i.id}</i>} />);
    expect(html).toContain("act-a");
  });
});

describe("groupByDay", () => {
  it("groups_keeping_order_with_korean_heading", () => {
    const g = groupByDay([photo("a", 0), routine("r", 1), routine("s", 2)]);
    expect(g.map((x) => [x.heading, x.items.length])).toEqual([["11월 18일", 1], ["11월 17일", 2]]);
  });
  it("photo_actions_render_only_on_visible_photos", () => {
    const html = renderToStaticMarkup(
      <Board
        items={[photo("a", 0), photo("h", 1, { hidden: true, photoUrl: undefined }), routine("r", 2)]}
        renderPhotoActions={(it) => <i className="act">{it.id}</i>}
      />,
    );
    expect(html.split('class="act"').length - 1).toBe(1);
    expect(html).toContain(">a</i>");
  });
});
