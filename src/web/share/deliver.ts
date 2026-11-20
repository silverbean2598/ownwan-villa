/**
 * 만든 이미지를 내보낸다.
 * - 공유하기: Web Share API 가 파일 공유를 받으면(휴대폰) 공유 창 → 인스타그램 · 카카오톡 등. 안 되면 저장으로
 * - 이미지 저장: <a download> 로 내려받기. 아이폰 · 아이패드 사파리는 내려받기가 불편해, 미리보기 그림을 길게 눌러 저장하게 안내한다
 */
export type DeliverResult = "shared" | "cancelled" | "downloaded" | "longpress";

type Nav = Pick<Navigator, "userAgent" | "maxTouchPoints"> & {
  platform?: string;
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

/** 아이폰 · 아이패드 (iPadOS 사파리는 맥으로 보이므로 터치 지점 수로 가린다) */
export function isIOS(nav: Nav = navigator): boolean {
  if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

/** 이 기기에서 파일 공유(공유 창)가 되는지 */
export function canShareFile(file: File, nav: Nav = navigator): boolean {
  try {
    return typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** <a download> 로 내려받는다. 아이폰 · 아이패드는 내려받지 않고 "longpress" (화면이 길게 눌러 저장 안내를 띄운다) */
export function saveImage(blob: Blob, filename: string, nav: Nav = navigator, doc: Document = document): DeliverResult {
  if (isIOS(nav)) return "longpress";
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  doc.body.appendChild(a);
  a.click();
  a.remove();
  // 바로 지우면 내려받기가 끊길 수 있어 조금 뒤에 지운다
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}

/** 공유 창을 연다. 파일 공유가 안 되거나 실패하면 저장으로. 사용자가 공유 창을 닫으면 "cancelled" */
export async function shareImage(blob: Blob, filename: string, nav: Nav = navigator, doc: Document = document): Promise<DeliverResult> {
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  if (canShareFile(file, nav)) {
    try {
      await nav.share!({ files: [file], title: "오운완빌라" });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // NotAllowedError(눌러서 연 게 아니라고 봄) 등: 저장으로 넘어간다
    }
  }
  return saveImage(blob, filename, nav, doc);
}
