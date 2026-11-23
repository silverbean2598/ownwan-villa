import { api } from "../api";
import { loadMyVillas, pickVilla } from "../villa/current";
import { kstDay } from "../../shared/rules/day";
import { displayStreak } from "../../shared/rules/streak";
import type { AvatarSpec } from "../../shared/avatar";
import type { Sport } from "../../shared/sports";
import type { BoardItemData } from "../components/Board";
import type { Member } from "../components/Building";

/** 오늘 인증 카드에 들어갈 것 (모두 내 것) */
export type CertCardData = {
  /** KST 날짜 "YYYY-MM-DD" */
  day: string;
  nickname: string;
  avatar: AvatarSpec;
  sport: Sport;
  /** 어느 아파트든 올린 날로 센 연속 기록 (오늘 포함) */
  streak: number;
  /** 고른 아파트에서 내 층. 아파트가 없으면 null */
  floor: number | null;
  penthouse: boolean;
  villaName: string | null;
  /** 오늘 루틴 (가장 최근 것) */
  routine: string | null;
  /** 오늘 내 인증 사진 주소 (가장 최근 것). "내 인증 사진 넣기"를 켰을 때만 받는다 */
  photoUrl: string | null;
};

type Me = { id: string; nickname: string; sport: Sport | null; avatar: AvatarSpec; streak?: number; certifiedToday?: boolean };
type VillaDetail = { id: string; name: string; penthouseUserId: string | null; members: Member[] };

/** 내 인증 사진 주소만 (다른 주소는 받지 않는다) */
const OWN_PHOTO = /^\/api\/photos\/[A-Za-z0-9_-]+$/;

/** 내 기록 중 오늘 것: 가장 최근 루틴 글 · 가장 최근 사진 주소 (가려진 기록은 뺀다) */
export function pickToday(items: BoardItemData[], day: string): { routine: string | null; photoUrl: string | null } {
  const today = items.filter((it) => it.day === day && !it.hidden);
  const routine = today.find((it) => it.kind === "routine" && it.body?.trim())?.body?.trim() ?? null;
  const photoUrl = today.find((it) => it.kind === "photo" && it.photoUrl && OWN_PHOTO.test(it.photoUrl))?.photoUrl ?? null;
  return { routine, photoUrl };
}

/**
 * 오늘 인증 카드 자료. villaId = 층 · 이름을 보여 줄 아파트 (없거나 내가 살지 않으면 이 기기에서 보던 아파트).
 * 사진은 내 게시판(/api/users/<나>/board)에서 오늘 내 사진 주소만 고른다. 그림을 받는 것은 그릴 때, 켰을 때만
 */
export async function loadCertCardData(villaId: string | null, now = Date.now()): Promise<CertCardData> {
  const day = kstDay(now);
  const me = await api<Me>("/api/me");
  const [villas, board] = await Promise.all([
    loadMyVillas().catch(() => []),
    api<BoardItemData[]>(`/api/users/${encodeURIComponent(me.id)}/board?limit=20`).catch(() => [] as BoardItemData[]),
  ]);
  const id = pickVilla(villas, villaId);
  const villa = id ? await api<VillaDetail>(`/api/villas/${id}`).catch(() => null) : null;
  const mine = villa?.members.find((m) => m.userId === me.id) ?? null;
  const streak = mine
    ? displayStreak(mine.userStreak ?? mine.streak, mine.certifiedAnywhere ?? mine.certifiedToday)
    : displayStreak(me.streak ?? 0, !!me.certifiedToday);
  const { routine, photoUrl } = pickToday(board, day);
  return {
    day,
    nickname: me.nickname,
    avatar: me.avatar,
    sport: mine?.sport ?? me.sport ?? "gym",
    streak,
    floor: mine ? mine.floor : null,
    penthouse: !!mine && villa?.penthouseUserId === me.id,
    villaName: villa?.name ?? null,
    routine,
    photoUrl,
  };
}
