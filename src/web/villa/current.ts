import { api } from "../api";
import type { MyVilla } from "../../shared/villa";

/** 이 기기에서 마지막으로 본 아파트 (아파트 여러 곳에 살 때). 개인 기기 편의용이라 못 읽거나 못 써도 화면은 그대로 돈다 */
const KEY = "ownwan:villa";

export function readCurrentVilla(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeCurrentVilla(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

/** 보여 줄 아파트: 원하는 아파트(want) → 이 기기에서 마지막으로 본 아파트 → 가장 먼저 입주한 아파트. 아파트가 없으면 null */
export function pickVilla(list: Pick<MyVilla, "id">[], want?: string | null): string | null {
  const ids = list.map((v) => v.id);
  for (const id of [want, readCurrentVilla()]) if (id && ids.includes(id)) return id;
  return ids[0] ?? null;
}

export const loadMyVillas = () => api<MyVilla[]>("/api/me/villas");

/** 아파트 화면 주소 */
export const villaPath = (id: string) => `/villa/${id}`;
/** 방 · 게시판 주소: 어느 아파트에서 보는지 함께 */
export const roomPath = (userId: string, villaId: string, board = false) =>
  `/room/${userId}${board ? "/board" : ""}?villa=${encodeURIComponent(villaId)}`;
