import type { ComponentType } from "react";
import { findItem } from "../../../shared/catalog";
import { FURNITURE_IMG } from "./art";
import { INK } from "./style";
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
import {
  Aquarium, Beanbag, Blender, Bookshelf, CatBed, CherryVase, DogBed, Fan, GamingChair, GoldStatue, HeartNeon, Heater, JackOLantern,
  JumpRopeHook, KettlebellSet, MiniFridge, PullupBar, RowingMachine, ShakerStand, SpinBike, StretchFrame, StringLights, XmasTree, YogaSet,
} from "./extra";

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
  // 꾸미기 확장
  "shaker-stand": ShakerStand,
  blender: Blender,
  "mini-fridge": MiniFridge,
  "yoga-set": YogaSet,
  "kettlebell-set": KettlebellSet,
  "jump-rope-hook": JumpRopeHook,
  "pullup-bar": PullupBar,
  "rowing-machine": RowingMachine,
  "spin-bike": SpinBike,
  "stretch-frame": StretchFrame,
  "heart-neon": HeartNeon,
  bookshelf: Bookshelf,
  "gaming-chair": GamingChair,
  beanbag: Beanbag,
  aquarium: Aquarium,
  "cat-bed": CatBed,
  "dog-bed": DogBed,
  "xmas-tree": XmasTree,
  "jack-o-lantern": JackOLantern,
  "cherry-vase": CherryVase,
  fan: Fan,
  heater: Heater,
  "string-lights": StringLights,
  "gold-statue": GoldStatue,
};

/** 가구 그림 파일이 있는 곳 (public/furniture → 빌드 결과 정적 파일). sm/ = 긴 변 128px 작은 그림 */
export const FURNITURE_BASE = "/furniture";

/** 그림 해상도: 원본(긴 변 256px) · 작은 그림(sm/, 긴 변 128px) */
export type FurnitureRes = "full" | "sm";

export const furnitureUrl = (itemId: string, res: FurnitureRes = "full") =>
  `${FURNITURE_BASE}/${res === "sm" ? "sm/" : ""}${itemId}.webp`;

/** 이 가구에 새 그림(webp)이 있는지. 없으면 옛 SVG 그림으로 그린다 */
export const hasFurnitureImage = (itemId: string) => itemId in FURNITURE_IMG;

/** 벽 가구는 가운데가 (0,0), 바닥 가구는 바닥에 닿는 가운데가 (0,0) 인 그림 상자 [x, y, 폭, 높이] */
export function furnitureBox(itemId: string): [number, number, number, number] | null {
  const s = FURNITURE_IMG[itemId];
  if (!s) return null;
  const [w, h] = s;
  const wall = findItem(itemId)?.slotType === "wall";
  return [-w / 2, wall ? -h / 2 : -h, w, h];
}

/**
 * svg 안에 넣는 가구 그림(<g>). 새 그림이 있으면 <image>, 없으면 옛 SVG 그림. 모르는 id는 그리지 않는다.
 * res: 빌라 방 칸처럼 작게 그릴 때는 "sm"
 */
export function Furniture({ itemId, res = "full" }: { itemId: string; res?: FurnitureRes }) {
  const box = furnitureBox(itemId);
  if (box) {
    const [x, y, width, height] = box;
    // 바닥 가구는 발밑에 옅은 그림자 (러그는 바닥에 붙어 있어 없음)
    const shadow = y === -height && itemId !== "rug";
    return (
      <g data-item={itemId}>
        {shadow && <ellipse cx="0" cy="-0.8" rx={width * 0.42} ry={Math.max(1.6, width * 0.06)} fill={INK} opacity="0.16" />}
        <image href={furnitureUrl(itemId, res)} x={x} y={y} width={width} height={height} preserveAspectRatio="none" />
      </g>
    );
  }
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
  "kettlebell-set": LOW,
  "cat-bed": LOW,
  "dog-bed": LOW,
  beanbag: "-26 -40 52 44",
  "rowing-machine": "-32 -42 64 46",
};

/** 상점 · 배치 목록용 단독 그림. 작게(64px 이하) 그릴 때는 sm/ 그림 */
export function FurnitureIcon({ itemId, size = 64 }: { itemId: string; size?: number }) {
  if (hasFurnitureImage(itemId)) {
    return (
      <img
        className="furniture-icon"
        src={furnitureUrl(itemId, size <= 64 ? "sm" : "full")}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        decoding="async"
        style={{ objectFit: "contain" }}
      />
    );
  }
  const wall = findItem(itemId)?.slotType === "wall";
  // 바닥 가구: 아래가 0, 벽 가구: 가운데가 0
  const vb = ICON_BOX[itemId] ?? (wall ? "-19 -19 38 38" : "-30 -55 60 59");
  return (
    <svg className="furniture-icon" viewBox={vb} width={size} height={size} aria-hidden="true">
      <Furniture itemId={itemId} />
    </svg>
  );
}
