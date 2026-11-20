// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fitText, wrapText } from "./text";
import { shareFileName } from "./filename";
import { canShareFile, isIOS, saveImage, shareImage } from "./deliver";

// 글자 하나 = 10px
const m = (s: string) => Array.from(s).length * 10;

describe("글자 배치", () => {
  it("fit_text_keeps_short_and_ellipsizes_long_villa_names", () => {
    expect(fitText("오운완빌라 3동", 200, m)).toBe("오운완빌라 3동");
    const long = "망원동한강뷰오운완클럽빌라삼동비호입니다";
    const t = fitText(long, 100, m);
    expect(t.endsWith("…")).toBe(true);
    expect(m(t)).toBeLessThanOrEqual(100);
    expect(t).toBe("망원동한강뷰오운완…");
    // 공백 · 줄바꿈은 하나로
    expect(fitText("  가  나\n다 ", 200, m)).toBe("가 나 다");
    expect(fitText("가나다", 5, m)).toBe("…");
  });

  it("wrap_text_breaks_on_spaces_then_chars_and_keeps_newlines", () => {
    expect(wrapText("스쿼트 5x5\n벤치 3x10", 200, 3, m)).toEqual(["스쿼트 5x5", "벤치 3x10"]);
    expect(wrapText("가나 다라 마바", 50, 3, m)).toEqual(["가나 다라", "마바"]);
    // 띄어쓰기 없는 긴 낱말은 글자에서 끊는다
    expect(wrapText("가나다라마바사아", 30, 5, m)).toEqual(["가나다", "라마바", "사아"]);
    expect(wrapText("\n\n", 100, 3, m)).toEqual([]);
  });

  it("wrap_text_truncates_long_routine_with_ellipsis_on_last_line", () => {
    const routine = "스쿼트 5x5 60kg\n벤치프레스 3x10 40kg\n데드리프트 3x5 70kg 마지막 세트는 정말 힘들었어요\n스트레칭";
    const lines = wrapText(routine, 120, 3, m);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith("…")).toBe(true);
    for (const l of lines) expect(m(l)).toBeLessThanOrEqual(120);
    // 딱 맞게 끝나면 … 를 붙이지 않는다
    expect(wrapText("가나\n다라", 100, 2, m)).toEqual(["가나", "다라"]);
  });
});

describe("파일 이름", () => {
  it("names_by_kind_and_day", () => {
    expect(shareFileName("cert", "2026-11-20")).toBe("ownwan-2026-11-20.png");
    expect(shareFileName("room", "2026-11-20")).toBe("ownwan-room-2026-11-20.png");
    expect(shareFileName("villa", "2026-11-20", "image/jpeg")).toBe("ownwan-villa-2026-11-20.jpg");
  });
});

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

describe("공유 · 저장", () => {
  afterEach(() => vi.restoreAllMocks());

  function spyDownload() {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });
    return clicks;
  }

  it("detects_ios_including_ipados", () => {
    expect(isIOS({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", maxTouchPoints: 5, platform: "MacIntel" })).toBe(true);
    expect(isIOS({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", maxTouchPoints: 0, platform: "MacIntel" })).toBe(false);
    expect(isIOS({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });

  it("can_share_true_calls_navigator_share_with_a_png_file", async () => {
    const clicks = spyDownload();
    const share = vi.fn(async () => {});
    const canShare = vi.fn(() => true);
    const r = await shareImage(png(), "ownwan-2026-11-20.png", { userAgent: ANDROID, maxTouchPoints: 5, share, canShare });
    expect(r).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const data = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(data.files).toHaveLength(1);
    const f = data.files![0];
    expect(f).toBeInstanceOf(File);
    expect(f.name).toBe("ownwan-2026-11-20.png");
    expect(f.type).toBe("image/png");
    expect(clicks).toHaveLength(0);
  });

  it("can_share_false_falls_back_to_download_link", async () => {
    const clicks = spyDownload();
    const share = vi.fn(async () => {});
    const r = await shareImage(png(), "ownwan-room-2026-11-20.png", { userAgent: DESKTOP, maxTouchPoints: 0, share, canShare: () => false });
    expect(r).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe("ownwan-room-2026-11-20.png");
    expect(clicks[0].getAttribute("href")).toBe("blob:x");
    // 링크는 누른 뒤 치운다
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("no_web_share_api_at_all_downloads", async () => {
    const clicks = spyDownload();
    expect(canShareFile(new File([png()], "a.png"), { userAgent: DESKTOP, maxTouchPoints: 0 })).toBe(false);
    expect(await shareImage(png(), "a.png", { userAgent: DESKTOP, maxTouchPoints: 0 })).toBe("downloaded");
    expect(clicks).toHaveLength(1);
  });

  it("user_cancelling_share_sheet_does_not_download", async () => {
    const clicks = spyDownload();
    const share = vi.fn(async () => {
      throw new DOMException("cancel", "AbortError");
    });
    expect(await shareImage(png(), "a.png", { userAgent: ANDROID, maxTouchPoints: 5, share, canShare: () => true })).toBe("cancelled");
    expect(clicks).toHaveLength(0);
  });

  it("share_failure_other_than_cancel_falls_back_to_download", async () => {
    const clicks = spyDownload();
    const share = vi.fn(async () => {
      throw new DOMException("no", "NotAllowedError");
    });
    expect(await shareImage(png(), "a.png", { userAgent: ANDROID, maxTouchPoints: 5, share, canShare: () => true })).toBe("downloaded");
    expect(clicks).toHaveLength(1);
  });

  it("ios_save_asks_long_press_instead_of_download", async () => {
    const clicks = spyDownload();
    expect(saveImage(png(), "a.png", { userAgent: IPHONE, maxTouchPoints: 5 })).toBe("longpress");
    // 아이폰에서 파일 공유가 안 되면(예전 iOS) 공유하기도 길게 눌러 저장 안내로
    expect(await shareImage(png(), "a.png", { userAgent: IPHONE, maxTouchPoints: 5 })).toBe("longpress");
    expect(clicks).toHaveLength(0);
  });
});
