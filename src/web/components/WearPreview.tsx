import { Avatar } from "./Avatar";
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

/** 상점 · 꾸미기 목록용 미리보기. 소품은 상반신만 크게 */
export function WearPreview({ spec, itemId, size = 80 }: { spec: AvatarSpec; itemId: string; size?: number }) {
  const s = wearing(spec, itemId);
  const box = findAccessory(itemId) ? "10 4 100 116" : "0 0 120 168";
  const [, , w, h] = box.split(" ").map(Number);
  return (
    <svg viewBox={box} width={(size * w) / h} height={size} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <Avatar spec={s} size={120} label="" />
    </svg>
  );
}
