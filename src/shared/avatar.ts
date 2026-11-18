export const AVATAR_OPTIONS = {
  // 밝은 톤 → 깊은 톤. 0번이 기준 그림의 피부색
  skin: ["#FDE7DA", "#F2CBA7", "#D6A077", "#94603F"],
  hair: ["short", "long", "bun", "buzz"],
  // 코랄 · 주황 · 노랑 · 민트 · 하늘 · 남색 · 라벤더 · 차콜 (기준 그림 8색)
  shirt: ["#F7766A", "#FDB07A", "#FBE58C", "#8FDCB2", "#BFDCF6", "#2E3D69", "#B7A1EA", "#4B4A4F"],
} as const;

export type AvatarSpec = { skin: number; hair: string; shirt: number };

export const DEFAULT_AVATAR: AvatarSpec = { skin: 0, hair: "short", shirt: 4 };

const inRange = (v: unknown, len: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < len;

export function parseAvatar(x: unknown): AvatarSpec | null {
  if (typeof x !== "object" || x === null) return null;
  const { skin, hair, shirt } = x as Record<string, unknown>;
  if (!inRange(skin, AVATAR_OPTIONS.skin.length) || !inRange(shirt, AVATAR_OPTIONS.shirt.length)) return null;
  if (typeof hair !== "string" || !(AVATAR_OPTIONS.hair as readonly string[]).includes(hair)) return null;
  return { skin: skin as number, hair, shirt: shirt as number };
}
