import { AVATAR_OPTIONS, DEFAULT_AVATAR, parseAvatar, type AvatarSpec } from "../../../shared/avatar";
import type { Pose } from "../avatar/poses";
import { SPRITE_MANIFEST, SPRITE_SM_H, type SpriteMeta } from "./manifest";

/** 그림 파일이 있는 곳 (public/avatar2 → 빌드 결과 정적 파일) */
export const SPRITE_BASE = "/avatar2";

// 앱의 머리 id → 그림 이름. 같은 이름은 그대로 쓴다
const HAIR_ASSET: Record<string, string> = { "side-part": "part" };

// 상점 옷 id → 그림 이름. 그림이 없는 옷 · 기본 옷(id 없음)은 반팔 티(tee)
const OUTFIT_ASSET: Record<string, string> = {
  "tank-joggers": "tank-joggers", // 민소매 · 조거
  hoodie: "hoodie", // 후드티
  "sports-bra-leggings": "sports-bra-leggings", // 스포츠 브라 · 레깅스
  singlet: "singlet", // 러닝 싱글렛
  "cycling-jersey": "cycling-jersey", // 사이클 저지
  rashguard: "rashguard", // 래시가드
};

/**
 * 기본 티셔츠 색 → 몸 그림 이름 (AVATAR_OPTIONS.shirt 순서: 코랄 · 주황 · 노랑 · 민트 · 하늘 · 남색 · 라벤더 · 차콜).
 * 하늘색은 그냥 "tee". 산 옷을 입으면 쓰지 않는다 (산 옷은 제 색 그대로)
 */
export const SHIRT_ASSET = ["tee-coral", "tee-orange", "tee-yellow", "tee-mint", "tee", "tee-navy", "tee-lavender", "tee-charcoal"] as const;

// 그림마다 캐릭터를 그린 배율이 달라 머리 크기로 맞춘다: hair-buzz-front 첫 칸의 불투명 영역(알파 > 0) 긴 변(px, 측정값)
const HEAD_PX: Record<Pose, number> = { idle: 178, sleep: 236, gym: 161, running: 173, pilates: 216, climbing: 133, jiujitsu: 201, taekwondo: 169 };
// 칸 아래 빈 줄(px). 발 · 매트 · 몸 아래끝을 바닥에 맞춘다 (body-tee(도복) 그림 불투명 영역 측정값)
const FLOOR_PAD: Partial<Record<Pose, number>> = { sleep: 2, pilates: 4, jiujitsu: 29, climbing: 1 };

/** 그림 해상도: 원본(세로 400px) · 작은 그림(sm/, 세로 160px) */
export type SpriteRes = "full" | "sm";

/**
 * 실제로 그려질 세로 크기(CSS px × devicePixelRatio)가 작은 그림 세로(160px) 이하면 sm/ 를 쓴다 (빌라 방 칸).
 * 크기를 모르면(0 · 측정 전) 원본
 */
export function spriteRes(cssH: number, dpr = 1): SpriteRes {
  const px = cssH * (dpr > 0 ? dpr : 1);
  return px > 0 && px <= SPRITE_SM_H ? "sm" : "full";
}

/** 한 칸씩 보여 줄 시간(초): 0→1→2→1 왕복 순서 */
export const FRAME_STEPS: Record<Pose, readonly [number, number, number, number]> = {
  idle: [0.7, 0.7, 0.7, 0.7],
  sleep: [0.8, 0.8, 0.8, 0.8],
  // 헬스: 머리 위로 다 들어 올린 칸(2)에서 조금 더 버틴다
  gym: [0.4, 0.4, 0.9, 0.4],
  running: [0.16, 0.16, 0.16, 0.16],
  pilates: [0.35, 0.35, 0.35, 0.35],
  climbing: [0.35, 0.35, 0.35, 0.35],
  jiujitsu: [0.35, 0.35, 0.35, 0.35],
  taekwondo: [0.35, 0.35, 0.35, 0.35],
};

export function spriteMeta(pose: Pose): SpriteMeta {
  return SPRITE_MANIFEST[pose];
}

export const hairAsset = (hair: string) => HAIR_ASSET[hair] ?? hair;

/** 이 자세에서 입을 몸 그림 이름. 도복 자세(주짓수 · 태권도)는 그림에 있는 옷 하나뿐 */
export function outfitAsset(spec: AvatarSpec, meta: SpriteMeta): string {
  const has = (o: string) => meta.outfits.includes(o);
  const want = (spec.outfit && OUTFIT_ASSET[spec.outfit]) || "tee";
  if (want === "tee") {
    const colored = SHIRT_ASSET[spec.shirt];
    if (colored && has(colored)) return colored;
  }
  if (has(want)) return want;
  return has("tee") ? "tee" : meta.outfits[0];
}

export type SpriteLayers = {
  meta: SpriteMeta;
  outfit: string;
  hair: string;
  /** 그릴 소품 (meta.accs 순서) */
  acc: string[];
  /** 그리는 순서: 뒷머리 → 몸 → 앞머리 → 소품 → 기구(바벨) */
  urls: string[];
  /** svg 안에서 띠 그림을 그릴 가로 (viewBox 단위 = 원본 px). sm/ 도 원본 배율로 늘려 칸 위치가 같다 */
  stripW: number;
};

/** 캐릭터 설정 · 자세 → 쌓을 그림 주소 (필요한 것만). res = "sm" 이면 sm/ 작은 그림 */
export function spriteLayers(raw: AvatarSpec, pose: Pose, res: SpriteRes = "full"): SpriteLayers {
  const spec = parseAvatar(raw) ?? DEFAULT_AVATAR;
  const meta = spriteMeta(pose);
  const dir = `${SPRITE_BASE}/${pose}${res === "sm" ? "/sm" : ""}`;
  const hair = meta.hairs.includes(hairAsset(spec.hair)) ? hairAsset(spec.hair) : hairAsset(DEFAULT_AVATAR.hair);
  const outfit = outfitAsset(spec, meta);
  const skin = Math.min(spec.skin, AVATAR_OPTIONS.skin.length - 1);
  // 비니는 머리 자리를 차지하므로 모자 · 헤어밴드는 그리지 않는다 (옛 캐릭터와 같은 규칙)
  // 소품끼리는 meta.accs 순서로 겹친다 (헤어밴드 · 모자 → 안경 → 이어폰 → 수건 → 손목 밴드). 몸 자리마다 하나는 parseAvatar 가 지킨다
  const worn = spec.acc ?? [];
  const acc = meta.accs.filter((a) => worn.includes(a) && !(spec.hair === "beanie" && (a === "cap" || a === "headband")));
  return {
    meta,
    outfit,
    hair,
    acc,
    stripW: res === "sm" ? (meta.smSw * meta.fh) / SPRITE_SM_H : meta.sw,
    urls: [
      `${dir}/hair-${hair}-back.webp`,
      `${dir}/body-${outfit}-s${skin}.webp`,
      `${dir}/hair-${hair}-front.webp`,
      ...acc.map((a) => `${dir}/acc-${a}.webp`),
      ...(meta.props ? [`${dir}/props.webp`] : []),
    ],
  };
}

/**
 * 옛 캐릭터 상자(size) 기준으로 그릴 크기와 위치.
 * 서 있는 기본 자세(idle)의 칸 높이 = 옛 상자의 발까지 높이(size × 1.4 × 155/168). 다른 자세는 머리 크기가 같아지게 배율을 맞추고,
 * 가로 1.5 · 세로 1.8 size 를 넘으면 줄인다. 아래끝(발 · 매트)이 floor 줄에 닿는다.
 */
export function spriteBox(pose: Pose, size: number) {
  const meta = spriteMeta(pose);
  const idleH = size * 1.4 * (155 / 168);
  let scale = (idleH / meta.fh) * (HEAD_PX.idle / HEAD_PX[pose]);
  scale = Math.min(scale, (1.5 * size) / meta.fw, (1.8 * size) / meta.fh);
  const w = meta.fw * scale;
  const h = meta.fh * scale;
  const pad = (FLOOR_PAD[pose] ?? 0) * scale;
  /** w · h: 한 칸을 그릴 크기, floor: 위끝에서 바닥까지 */
  return { w, h, floor: h - pad, scale };
}

/** 왕복 애니메이션 전체 시간(초, 동작 줄이기 전) */
export const cycleSeconds = (pose: Pose) => FRAME_STEPS[pose].reduce((a, b) => a + b, 0);
