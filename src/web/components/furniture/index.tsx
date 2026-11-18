import type { ComponentType } from "react";
import { findItem } from "../../../shared/catalog";
import { FloorLamp, LandscapeFrame, OwunwanFrame, Plant, Rug, TrophyShelf, WallClock } from "./common";
import {
  BeltFrame,
  Bench,
  BoardFrame,
  BottleStand,
  ChalkHook,
  CrashPad,
  DumbbellRack,
  FoamRoller,
  FullMirror,
  GiHanger,
  GrapplingDummy,
  GymBall,
  KickPaddleStand,
  MedalFrame,
  MiniWall,
  Reformer,
  Sandbag,
  ShoeShelf,
} from "./sports";

// 가구 그림. 바닥 가구는 바닥에 닿는 가운데가 (0,0), 벽 가구는 가운데가 (0,0).
export const FURNITURE_ART: Record<string, ComponentType> = {
  plant: Plant,
  rug: Rug,
  "floor-lamp": FloorLamp,
  "landscape-frame": LandscapeFrame,
  "owunwan-frame": OwunwanFrame,
  "wall-clock": WallClock,
  "trophy-shelf": TrophyShelf,
  bench: Bench,
  "dumbbell-rack": DumbbellRack,
  "full-mirror": FullMirror,
  reformer: Reformer,
  "gym-ball": GymBall,
  "foam-roller": FoamRoller,
  "shoe-shelf": ShoeShelf,
  "bottle-stand": BottleStand,
  "medal-frame": MedalFrame,
  "crash-pad": CrashPad,
  "mini-wall": MiniWall,
  "chalk-hook": ChalkHook,
  "grappling-dummy": GrapplingDummy,
  "gi-hanger": GiHanger,
  "belt-frame": BeltFrame,
  sandbag: Sandbag,
  "kick-paddle-stand": KickPaddleStand,
  "board-frame": BoardFrame,
};

/** svg 안에 넣는 가구 그림(<g>). 모르는 id는 그리지 않는다. */
export function Furniture({ itemId }: { itemId: string }) {
  const Art = FURNITURE_ART[itemId];
  return Art ? (
    <g data-item={itemId}>
      <Art />
    </g>
  ) : null;
}

// 낮은 바닥 가구는 목록에서 작아 보이지 않게 확대
const LOW = "-24 -38 48 42";
const ICON_BOX: Record<string, string> = {
  rug: "-32 -26 64 28",
  bench: LOW,
  "gym-ball": LOW,
  "foam-roller": LOW,
  "bottle-stand": LOW,
  "shoe-shelf": LOW,
  "crash-pad": LOW,
  plant: LOW,
};

/** 상점 · 배치 목록용 단독 그림 */
export function FurnitureIcon({ itemId, size = 64 }: { itemId: string; size?: number }) {
  const wall = findItem(itemId)?.slotType === "wall";
  // 바닥 가구: 아래가 0, 벽 가구: 가운데가 0
  const vb = ICON_BOX[itemId] ?? (wall ? "-19 -19 38 38" : "-30 -55 60 59");
  return (
    <svg className="furniture-icon" viewBox={vb} width={size} height={size} aria-hidden="true">
      <Furniture itemId={itemId} />
    </svg>
  );
}
