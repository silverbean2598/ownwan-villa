import { SpriteAvatar, SpriteCrop } from "./avatar2/SpriteAvatar";
import { spriteBox } from "./avatar2/layers";
import { findAccessory, findOutfit } from "../../shared/catalog";
import type { AvatarSpec } from "../../shared/avatar";

/** 내 캐릭터에 옷 · 소품 하나를 입혀 본 모습 (같은 자리 소품은 바꿔 낀다) */
export function wearing(spec: AvatarSpec, itemId: string): AvatarSpec {
  if (findOutfit(itemId)) return { ...spec, outfit: itemId };
  const item = findAccessory(itemId);
  if (!item) return spec;
  const acc = [...(spec.acc ?? []).filter((a) => findAccessory(a)?.accSlot !== item.accSlot), itemId];
  // 비니를 쓰면 머리 소품이 숨으므로 미리보기에서는 짧은 머리로 보여 준다
  const hair = item.accSlot === "head" && spec.hair === "beanie" ? "short" : spec.hair;
  return { ...spec, hair, acc };
}

// 소품 미리보기: 서 있는 그림(275 × 400) 머리 ~ 손목 밴드까지 상반신
const ACC_BOX = [18, 2, 240, 296] as const;

/** 상점 · 꾸미기 목록용 미리보기 (서 있는 자세). 옷은 온몸, 소품은 상반신만 크게. size = 그릴 세로(px) */
export function WearPreview({ spec, itemId, size = 80 }: { spec: AvatarSpec; itemId: string; size?: number }) {
  const s = wearing(spec, itemId);
  if (findAccessory(itemId)) return <SpriteCrop spec={s} box={ACC_BOX} height={size} />;
  // 온몸: 그림 높이 = size
  const b = spriteBox("idle", 1);
  return <SpriteAvatar spec={s} size={size / b.h} pose="idle" label="" />;
}
