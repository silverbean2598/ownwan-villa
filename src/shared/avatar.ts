export const AVATAR_OPTIONS = {
  skin: ["#F6D7B8", "#E8B98E", "#C98E62", "#8D5A3B"],
  hair: ["short", "long", "bun", "buzz"],
  shirt: ["#E57373", "#FFB74D", "#FFD54F", "#81C784", "#4DB6AC", "#64B5F6", "#9575CD", "#F06292"],
} as const;

export type AvatarSpec = { skin: number; hair: string; shirt: number };

export const DEFAULT_AVATAR: AvatarSpec = { skin: 0, hair: "short", shirt: 0 };

const inRange = (v: unknown, len: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < len;

export function parseAvatar(x: unknown): AvatarSpec | null {
  if (typeof x !== "object" || x === null) return null;
  const { skin, hair, shirt } = x as Record<string, unknown>;
  if (!inRange(skin, AVATAR_OPTIONS.skin.length) || !inRange(shirt, AVATAR_OPTIONS.shirt.length)) return null;
  if (typeof hair !== "string" || !(AVATAR_OPTIONS.hair as readonly string[]).includes(hair)) return null;
  return { skin: skin as number, hair, shirt: shirt as number };
}
