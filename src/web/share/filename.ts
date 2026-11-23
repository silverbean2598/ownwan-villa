/** 공유 이미지 종류: 오늘 인증 카드 · 내 방 · 우리 아파트 전체 */
export type ShareKind = "cert" | "room" | "villa";

/** 저장 파일 이름: ownwan-2026-11-20.png (인증 카드) · ownwan-room-2026-11-20.png · ownwan-villa-2026-11-20.jpg */
export function shareFileName(kind: ShareKind, day: string, type = "image/png"): string {
  const ext = type === "image/jpeg" ? "jpg" : "png";
  return `ownwan${kind === "cert" ? "" : `-${kind}`}-${day}.${ext}`;
}
