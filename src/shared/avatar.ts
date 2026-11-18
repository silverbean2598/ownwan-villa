import { findAccessory, findOutfit } from "./catalog";

export const AVATAR_OPTIONS = {
  // 밝은 톤 → 깊은 톤. 0번이 기준 그림의 피부색
  skin: ["#FDE7DA", "#F2CBA7", "#D6A077", "#94603F"],
  // 앞의 4개는 1차 머리. 뒤의 6개는 꾸미기 확장(무료). beanie 는 짧은 머리 위 비니(옷 색)
  hair: ["short", "long", "bun", "buzz", "side-part", "afro", "pigtails", "ponytail", "wolf", "beanie"],
  // 코랄 · 주황 · 노랑 · 민트 · 하늘 · 남색 · 라벤더 · 차콜 (기준 그림 8색)
  shirt: ["#F7766A", "#FDB07A", "#FBE58C", "#8FDCB2", "#BFDCF6", "#2E3D69", "#B7A1EA", "#4B4A4F"],
} as const;

/**
 * 캐릭터 설정 (users.avatar 에 JSON 으로 저장).
 * outfit: 산 옷 id (없으면 기본 반팔 티 + 반바지), acc: 산 소품 id 목록 (몸 자리마다 하나). 둘 다 없던 옛 저장값도 그대로 읽힌다.
 */
export type AvatarSpec = { skin: number; hair: string; shirt: number; outfit?: string; acc?: string[] };

export const DEFAULT_AVATAR: AvatarSpec = { skin: 0, hair: "short", shirt: 4 };

const inRange = (v: unknown, len: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < len;

/** 옷 · 소품 id 를 꺼낸다 (가진 것인지 서버가 확인할 때) */
export function wornItemIds(a: AvatarSpec): string[] {
  return [...(a.outfit ? [a.outfit] : []), ...(a.acc ?? [])];
}

export function parseAvatar(x: unknown): AvatarSpec | null {
  if (typeof x !== "object" || x === null) return null;
  const { skin, hair, shirt, outfit, acc } = x as Record<string, unknown>;
  if (!inRange(skin, AVATAR_OPTIONS.skin.length) || !inRange(shirt, AVATAR_OPTIONS.shirt.length)) return null;
  if (typeof hair !== "string" || !(AVATAR_OPTIONS.hair as readonly string[]).includes(hair)) return null;
  const out: AvatarSpec = { skin: skin as number, hair, shirt: shirt as number };
  // null · 빠짐 = 기본 옷
  if (outfit !== undefined && outfit !== null) {
    if (!findOutfit(outfit)) return null;
    out.outfit = outfit as string;
  }
  if (acc !== undefined) {
    if (!Array.isArray(acc)) return null;
    const slots = new Set<string>();
    for (const id of acc) {
      const item = findAccessory(id);
      // 몸 자리마다 하나 (같은 소품 두 번도 여기서 걸린다)
      if (!item || slots.has(item.accSlot)) return null;
      slots.add(item.accSlot);
    }
    if (acc.length) out.acc = [...acc];
  }
  return out;
}
