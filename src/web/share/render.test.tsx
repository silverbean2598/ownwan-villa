// @vitest-environment jsdom
// 그리기 자체는 canvas 를 흉내 내어 끝까지 돌아가는지(멈추지 않고 이미지가 나오는지)만 본다
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderCertCard, renderRoomCard, renderVillaCard, dayLabel, floorText } from "./render";
import { sceneMarkup } from "./scene";
import { RoomScene } from "../components/RoomScene";
import type { CertCardData } from "./data";
import type { Member } from "../components/Building";

const calls: { fn: string; args: unknown[] }[] = [];
const canvases: HTMLCanvasElement[] = [];
let fetched: string[] = [];

function fakeCtx() {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === "measureText") return (s: string) => ({ width: Array.from(s).length * 20 });
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => ({ addColorStop() {} });
      return (...args: unknown[]) => void calls.push({ fn: k, args });
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  });
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  width = 0;
  decoding = "";
  private _src = "";
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    setTimeout(() => {
      // 일부러 하나는 실패시킨다: 그 층 없이 그려야 한다
      if (v.includes("acc-glasses")) return this.onerror?.();
      this.naturalWidth = this.width = 300;
      this.naturalHeight = 400;
      this.onload?.();
    }, 0);
  }
}

beforeEach(() => {
  calls.length = 0;
  canvases.length = 0;
  fetched = [];
  const orig = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string, o?: ElementCreationOptions) => {
    const el = orig(tag, o);
    if (tag === "canvas") {
      canvases.push(el as HTMLCanvasElement);
      (el as HTMLCanvasElement).getContext = (() => fakeCtx()) as never;
      (el as HTMLCanvasElement).toBlob = (cb: BlobCallback, type?: string) => cb(new Blob(["png"], { type: type ?? "image/png" }));
    }
    return el;
  }) as typeof document.createElement);
  vi.stubGlobal("Image", FakeImage);
  // jsdom 의 FileReader 는 fetch 가 준 Blob 을 못 읽어서 흉내 낸다
  vi.stubGlobal(
    "FileReader",
    class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = "data:image/webp;base64,AAAA";
        setTimeout(() => this.onload?.(), 0);
      }
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      return new Response("img", { status: 200, headers: { "content-type": url.includes("photos") ? "image/jpeg" : "image/webp" } });
    }),
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const cert: CertCardData = {
  day: "2026-11-20", nickname: "민지", avatar: { skin: 0, hair: "long", shirt: 0, acc: ["glasses"] }, sport: "gym", streak: 7, floor: 5,
  penthouse: false, villaName: "오운완빌라 3동", routine: "스쿼트 5x5 60kg\n벤치 3x10", photoUrl: "/api/photos/c1",
};
const member = (i: number, p: Partial<Member> = {}): Member => ({
  userId: `u${i}`, nickname: `입주민${i}`, sport: "running", avatar: { skin: 1, hair: "afro", shirt: 1 }, floor: 1 + (i % 4), streak: i,
  certifiedToday: i % 2 === 0, placements: [], ...p,
});
const texts = () => calls.filter((c) => c.fn === "fillText").map((c) => String(c.args[0]));

describe("공유 이미지 그리기 (canvas 흉내)", () => {
  it("helpers", () => {
    expect(dayLabel("2026-11-20")).toBe("11월 20일 금요일");
    expect(floorText(5, false)).toBe("5층");
    expect(floorText(5, true)).toBe("펜트하우스");
    expect(floorText(null, false)).toBe("–");
  });

  it("cert_card_photo_off_never_fetches_photo", async () => {
    const r = await renderCertCard(cert, false);
    expect(r.blob.type).toBe("image/png");
    expect(r.photoMissing).toBe(false);
    expect(canvases[0].width).toBe(1080);
    expect(canvases[0].height).toBe(1920);
    expect(fetched.some((u) => u.includes("/api/photos/"))).toBe(false);
    expect(texts()).toEqual(expect.arrayContaining(["오늘 오운완!", "11월 20일 금요일", "오운완빌라 3동", "7일", "5층", "헬스", "오늘 루틴", "오운완빌라"]));
    // 캐릭터: 안경 그림은 못 받았지만 나머지 층은 그렸다
    expect(calls.filter((c) => c.fn === "drawImage").length).toBeGreaterThanOrEqual(3);
  });

  it("cert_card_photo_on_fetches_only_own_photo", async () => {
    const r = await renderCertCard(cert, true);
    expect(fetched.filter((u) => u.includes("/api/photos/"))).toEqual(["/api/photos/c1"]);
    expect(r.photoMissing).toBe(false);
    // 오늘 사진이 없으면 아무것도 받지 않고 알려 준다
    fetched = [];
    const r2 = await renderCertCard({ ...cert, photoUrl: null }, true);
    expect(fetched.some((u) => u.includes("/api/photos/"))).toBe(false);
    expect(r2.photoMissing).toBe(true);
  });

  it("scene_markup_freezes_sprite_frame_and_sizes_svg", () => {
    const s = sceneMarkup(createElement(RoomScene, { sport: "gym", lit: true, avatar: { skin: 0, hair: "short", shirt: 4 }, variant: "detail" }), 600, 720);
    expect(s).toContain('width="600"');
    expect(s).toContain('height="720"');
    expect(s).toContain("/avatar2/gym/body-tee-s0.webp");
    // 2번째 칸으로 옮겨 둔다
    expect(s).toMatch(/<g transform="translate\(-\d+ 0\)"><image/);
    // 게시판 없이 그리면 코르크판
    expect(s).toContain('data-part="cork"');
    // 화면 밖 그리기 자리는 치운다
    expect(document.body.children.length).toBe(0);
  });

  it("room_card_square_with_room_scene", async () => {
    const blob = await renderRoomCard({ member: member(0, { nickname: "민지", placements: [{ slot: "floor1", itemId: "plant" }] }), penthouse: false, villaName: "오운완빌라 3동" });
    expect(blob.type).toBe("image/png");
    expect(canvases[0].width).toBe(1080);
    expect(canvases[0].height).toBe(1080);
    expect(texts()).toEqual(expect.arrayContaining(["민지의 방", "오늘 오운완 완료"]));
    // 방 그림 안의 가구 · 캐릭터 그림을 svg 에 넣으려고 받았다
    expect(fetched).toEqual(expect.arrayContaining(["/furniture/plant.webp"]));
    expect(fetched.some((u) => u.startsWith("/avatar2/"))).toBe(true);
    const svgDraw = calls.find((c) => c.fn === "drawImage" && String((c.args[0] as FakeImage).src).startsWith("data:image/svg+xml"));
    expect(svgDraw).toBeTruthy();
    // svg 안의 그림은 data: 주소로 바뀌어 있다 (svg 그림은 바깥 파일을 못 읽는다)
    const svg = decodeURIComponent(String((svgDraw!.args[0] as FakeImage).src));
    expect(svg).not.toMatch(/href="\/(avatar2|furniture)\//);
    expect(svg).toContain('href="data:image/webp;base64,');
    // 맨 바깥 svg 의 xmlns 는 한 번만
    expect(svg.slice(0, svg.indexOf(">")).match(/xmlns=/g)).toHaveLength(1);
  });

  it("villa_card_tall_with_every_member_no_photos", async () => {
    const members = Array.from({ length: 12 }, (_, i) => member(i));
    const blob = await renderVillaCard({ villa: { name: "오운완빌라 3동", ownerId: "u0", penthouseUserId: "u3", members, price: 32 }, meId: "u1" });
    expect(blob.size).toBeGreaterThan(0);
    expect(canvases[0].width).toBe(1080);
    expect(canvases[0].height).toBeGreaterThan(1500);
    const t = texts();
    for (const m of members) expect(t.some((x) => x.startsWith(m.nickname.slice(0, 3)))).toBe(true);
    expect(t).toEqual(expect.arrayContaining(["3.2억", "12/20명", "방장", "나"]));
    expect(fetched.some((u) => u.includes("/api/photos/"))).toBe(false);
  });
});
