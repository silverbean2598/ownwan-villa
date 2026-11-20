// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCertCardData, pickToday } from "./data";
import { createMaker } from "./make";
import type { BoardItemData } from "../components/Board";

const DAY = "2026-11-20";
// 2026-11-20 12:00 KST
const NOW = Date.parse("2026-11-20T03:00:00Z");

const item = (p: Partial<BoardItemData>): BoardItemData => ({ id: "x", kind: "routine", day: DAY, hidden: false, createdAt: 0, ...p });

describe("오늘 내 기록 고르기", () => {
  it("picks_latest_today_routine_and_own_photo_skipping_hidden_and_other_days", () => {
    const items = [
      item({ id: "p0", kind: "photo", hidden: true }),
      item({ id: "r1", body: "  스쿼트 5x5  " }),
      item({ id: "p1", kind: "photo", photoUrl: "/api/photos/p1" }),
      item({ id: "r0", body: "어제 루틴", day: "2026-11-19" }),
    ];
    expect(pickToday(items, DAY)).toEqual({ routine: "스쿼트 5x5", photoUrl: "/api/photos/p1" });
    expect(pickToday(items, "2026-11-21")).toEqual({ routine: null, photoUrl: null });
    // 내 사진 주소 모양이 아니면 쓰지 않는다
    expect(pickToday([item({ kind: "photo", photoUrl: "https://evil.example/x.jpg" })], DAY).photoUrl).toBeNull();
  });
});

describe("인증 카드 자료", () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockApi() {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        calls.push(path);
        const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
        if (path === "/api/me") return ok({ id: "me", nickname: "민지", sport: "gym", avatar: { skin: 0, hair: "long", shirt: 0 }, streak: 3, certifiedToday: true });
        if (path === "/api/me/villas") return ok([{ id: "A", name: "가" }, { id: "B", name: "나" }]);
        if (path === "/api/villas/B")
          return ok({
            id: "B", name: "오운완빌라 3동", penthouseUserId: null,
            members: [
              { userId: "me", nickname: "민지", sport: "pilates", avatar: {}, floor: 5, streak: 2, userStreak: 6, certifiedToday: true, certifiedAnywhere: true, placements: [] },
              { userId: "u2", nickname: "준호", sport: "gym", avatar: {}, floor: 1, streak: 0, certifiedToday: true, placements: [] },
            ],
          });
        if (path.startsWith("/api/users/me/board"))
          return ok([item({ id: "r1", body: "플랭크" }), item({ id: "p1", kind: "photo", photoUrl: "/api/photos/p1" })]);
        return new Response("{}", { status: 404 });
      }),
    );
    return calls;
  }

  it("loads_my_floor_streak_villa_and_only_my_board", async () => {
    const calls = mockApi();
    const d = await loadCertCardData("B", NOW);
    expect(d).toMatchObject({ day: DAY, nickname: "민지", sport: "pilates", streak: 7, floor: 5, penthouse: false, villaName: "오운완빌라 3동", routine: "플랭크", photoUrl: "/api/photos/p1" });
    // 내 게시판만 읽고, 사진 그림은 아직 받지 않는다
    expect(calls.filter((c) => c.includes("/board"))).toEqual(["/api/users/me/board?limit=20"]);
    expect(calls.some((c) => c.startsWith("/api/photos/"))).toBe(false);
  });

  it("photo_toggle_passes_own_photo_only_when_on_and_loads_data_once", async () => {
    const loadCert = vi.fn(async () => ({
      day: DAY, nickname: "민지", avatar: { skin: 0, hair: "long", shirt: 0 }, sport: "gym" as const, streak: 7, floor: 5, penthouse: false,
      villaName: "v", routine: null, photoUrl: "/api/photos/p1",
    }));
    const renderCert = vi.fn(async (_d: unknown, withPhoto: boolean) => ({ blob: new Blob(["x"], { type: "image/png" }), photoMissing: false, withPhoto }));
    const make = createMaker({ kind: "cert", villaId: "B" }, { loadCert, renderCert, now: () => NOW });
    const off = await make({ photo: false });
    expect(renderCert).toHaveBeenLastCalledWith(expect.anything(), false);
    expect(off.filename).toBe("ownwan-2026-11-20.png");
    expect(off.hasPhotoOption).toBe(true);
    await make({ photo: true });
    expect(renderCert).toHaveBeenLastCalledWith(expect.objectContaining({ photoUrl: "/api/photos/p1" }), true);
    expect(loadCert).toHaveBeenCalledTimes(1);
  });

  it("room_and_villa_names_and_jpeg_extension", async () => {
    const renderRoom = vi.fn(async () => new Blob(["x"], { type: "image/png" }));
    const renderVilla = vi.fn(async () => new Blob(["x"], { type: "image/jpeg" }));
    const room = createMaker({ kind: "room", input: {} as never }, { renderRoom, now: () => NOW });
    expect((await room({ photo: true })).filename).toBe("ownwan-room-2026-11-20.png");
    const villa = createMaker({ kind: "villa", input: {} as never }, { renderVilla, now: () => NOW });
    const v = await villa({ photo: false });
    expect(v.filename).toBe("ownwan-villa-2026-11-20.jpg");
    expect(v.hasPhotoOption).toBe(false);
  });

  it("retries_loading_after_failure", async () => {
    let n = 0;
    const loadCert = vi.fn(async () => {
      if (n++ === 0) throw new Error("offline");
      return { day: DAY, nickname: "a", avatar: { skin: 0, hair: "short", shirt: 0 }, sport: "gym" as const, streak: 1, floor: 1, penthouse: false, villaName: null, routine: null, photoUrl: null };
    });
    const renderCert = vi.fn(async () => ({ blob: new Blob(["x"], { type: "image/png" }), photoMissing: false }));
    const make = createMaker({ kind: "cert", villaId: null }, { loadCert, renderCert, now: () => NOW });
    await expect(make({ photo: false })).rejects.toThrow("offline");
    await expect(make({ photo: false })).resolves.toBeTruthy();
  });
});
