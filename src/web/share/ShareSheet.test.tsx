// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShareSheet from "./ShareSheet";
import type { ShareImage } from "./make";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function mount(kind: "cert" | "room", make: (o: { photo: boolean }) => Promise<ShareImage>, onClose = () => {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const card = kind === "cert" ? { kind, villaId: "B" } : { kind, input: {} as never };
  await act(async () => root.render(<ShareSheet card={card as never} make={make} onClose={onClose} />));
  await flush();
}
const img = (photoMissing = false): ShareImage => ({ blob: new Blob(["x"], { type: "image/png" }), filename: "ownwan-2026-11-20.png", photoMissing, hasPhotoOption: true });

describe("ShareSheet", () => {
  it("cert_photo_toggle_defaults_off_and_rerenders_with_photo_when_on", async () => {
    const make = vi.fn(async () => img());
    await mount("cert", make);
    const toggle = host.querySelector<HTMLInputElement>('.share-toggle input[type="checkbox"]')!;
    expect(toggle.checked).toBe(false);
    expect(make).toHaveBeenCalledTimes(1);
    expect(make).toHaveBeenLastCalledWith({ photo: false });
    const preview = host.querySelector<HTMLImageElement>(".share-preview img")!;
    expect(preview.alt).toBe("오늘 오운완 인증 카드 미리보기");
    expect(host.querySelector('[role="dialog"]')!.getAttribute("aria-labelledby")).toBe("share-title");
    await act(async () => toggle.click());
    await flush();
    expect(make).toHaveBeenLastCalledWith({ photo: true });
  });

  it("shows_loading_then_enables_buttons", async () => {
    let resolve!: (v: ShareImage) => void;
    const make = vi.fn(() => new Promise<ShareImage>((r) => (resolve = r)));
    await mount("room", make);
    expect(host.textContent).toContain("이미지를 만들고 있어요");
    const btn = (name: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === name)!;
    expect(btn("이미지 저장").disabled).toBe(true);
    expect(btn("공유하기").disabled).toBe(true);
    // 방 · 빌라에는 사진 넣기가 없다
    expect(host.querySelector(".share-toggle")).toBeNull();
    await act(async () => resolve(img()));
    await flush();
    expect(host.textContent).not.toContain("이미지를 만들고 있어요");
    expect(btn("이미지 저장").disabled).toBe(false);
    expect(host.querySelector<HTMLImageElement>(".share-preview img")!.alt).toBe("내 방 이미지 미리보기");
  });

  it("tells_when_today_has_no_photo", async () => {
    const make = vi.fn(async (o: { photo: boolean }) => img(o.photo));
    await mount("cert", make);
    await act(async () => host.querySelector<HTMLInputElement>(".share-toggle input")!.click());
    await flush();
    expect(host.textContent).toContain("오늘 올린 내 사진이 없어서");
  });

  it("render_failure_shows_error", async () => {
    await mount("room", async () => {
      throw new Error("x");
    });
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("이미지를 만들지 못했어요");
  });

  it("escape_closes", async () => {
    const onClose = vi.fn();
    await mount("room", async () => img(), onClose);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onClose).toHaveBeenCalled();
  });
});
