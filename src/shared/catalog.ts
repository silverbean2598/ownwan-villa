// 기획자 확정 전 임시 목록
import type { Sport } from "./sports";

export const SLOTS = ["wall1", "wall2", "floor1", "floor2", "floor3"] as const;
export type Slot = (typeof SLOTS)[number];
export type SlotType = "floor" | "wall";

export type Item = { id: string; name: string; sport: Sport | "common"; slotType: SlotType; price: number };

export const CATALOG: Item[] = [
  { id: "plant", name: "화분", sport: "common", slotType: "floor", price: 80 },
  { id: "rug", name: "러그", sport: "common", slotType: "floor", price: 100 },
  { id: "floor-lamp", name: "스탠드 조명", sport: "common", slotType: "floor", price: 120 },
  { id: "landscape-frame", name: "풍경 액자", sport: "common", slotType: "wall", price: 60 },
  { id: "owunwan-frame", name: "\"오운완\" 문구 액자", sport: "common", slotType: "wall", price: 60 },
  { id: "wall-clock", name: "벽시계", sport: "common", slotType: "wall", price: 80 },
  { id: "trophy-shelf", name: "트로피 선반", sport: "common", slotType: "wall", price: 150 },
  { id: "bench", name: "벤치", sport: "gym", slotType: "floor", price: 120 },
  { id: "dumbbell-rack", name: "덤벨 랙", sport: "gym", slotType: "floor", price: 150 },
  { id: "full-mirror", name: "전신 거울", sport: "gym", slotType: "wall", price: 100 },
  { id: "reformer", name: "리포머", sport: "pilates", slotType: "floor", price: 200 },
  { id: "gym-ball", name: "짐볼", sport: "pilates", slotType: "floor", price: 80 },
  { id: "foam-roller", name: "폼롤러", sport: "pilates", slotType: "floor", price: 60 },
  { id: "shoe-shelf", name: "러닝화 선반", sport: "running", slotType: "floor", price: 80 },
  { id: "bottle-stand", name: "물병 거치대", sport: "running", slotType: "floor", price: 60 },
  { id: "medal-frame", name: "완주 메달 액자", sport: "running", slotType: "wall", price: 100 },
  { id: "crash-pad", name: "크래시패드", sport: "climbing", slotType: "floor", price: 120 },
  { id: "mini-wall", name: "미니 볼더링 벽", sport: "climbing", slotType: "wall", price: 180 },
  { id: "chalk-hook", name: "초크백 걸이", sport: "climbing", slotType: "wall", price: 60 },
  { id: "grappling-dummy", name: "그래플링 더미", sport: "jiujitsu", slotType: "floor", price: 150 },
  { id: "gi-hanger", name: "도복 걸이", sport: "jiujitsu", slotType: "wall", price: 80 },
  { id: "belt-frame", name: "띠 액자", sport: "jiujitsu", slotType: "wall", price: 100 },
  { id: "sandbag", name: "샌드백", sport: "taekwondo", slotType: "floor", price: 150 },
  { id: "kick-paddle-stand", name: "발차기 미트 거치대", sport: "taekwondo", slotType: "floor", price: 100 },
  { id: "board-frame", name: "격파 송판 액자", sport: "taekwondo", slotType: "wall", price: 100 },
];

export function findItem(id: unknown): Item | undefined {
  return CATALOG.find((i) => i.id === id);
}

export function slotType(slot: Slot): SlotType {
  return slot.startsWith("wall") ? "wall" : "floor";
}

export function isSlot(s: unknown): s is Slot {
  return (SLOTS as readonly unknown[]).includes(s);
}
