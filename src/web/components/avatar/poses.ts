export type Pose = "idle" | "sleep" | "gym" | "running" | "pilates" | "climbing" | "jiujitsu" | "taekwondo";
export type Face =
  | "smile"
  | "happy"
  | "effort"
  | "sleep"
  // 축하 · 알림 화면 표정 (docs/art-reference/expressions.webp)
  | "proud"
  | "tears"
  | "laugh"
  | "shocked"
  | "sulk"
  | "yawn"
  | "determined"
  | "shy"
  | "smug"
  | "cool"
  | "sad"
  | "angry"
  // 하트 눈 (응원받았을 때)
  | "love";

export const FACES: Face[] = [
  "smile", "happy", "effort", "sleep", "proud", "tears", "laugh", "shocked", "sulk", "yawn", "determined", "shy", "smug", "cool", "sad", "angry", "love",
];

/**
 * 컷아웃 리그의 관절 각도(도, 시계 방향 +).
 * arm/leg는 어깨 · 골반 기준, elb는 팔꿈치에서 아래팔이 꺾이는 상대 각도.
 * 왼팔(화면 왼쪽)은 +가 바깥쪽, 오른팔은 −가 바깥쪽.
 */
export type PoseDef = {
  armL: number;
  armR: number;
  elbL: number;
  elbR: number;
  legL: number;
  legR: number;
  torso: number;
  headTilt: number;
  offsetY: number;
  face: Face;
  /** 아래팔 길이(기본 13). 바벨을 머리 위로 드는 자세만 길게 늘인다. */
  fore?: number;
  /** 팔을 머리 앞에 그린다(바벨). */
  armsFront?: boolean;
  /** 리그 전체를 눕힌다(필라테스 · 주짓수). 값은 리그에 거는 안쪽 transform (viewBox 원점은 늘 0 0). */
  lying?: string;
  /** 누운 자세에서 바닥에 닿는 높이(svg 높이 비율) */
  floorAt?: number;
  uniform?: "gi" | "dobok";
  /** 주짓수 가드: 그래플링 더미를 다리 사이에 둔다 */
  dummy?: boolean;
};

const LYING = "translate(36 -42) rotate(-90 60 100)";
const base = { elbL: 0, elbR: 0, torso: 0, headTilt: 0, offsetY: 0 };

export const POSES: Record<Pose, PoseDef> = {
  idle: { ...base, armL: 24, armR: -24, legL: 4, legR: -4, face: "smile" },
  sleep: { ...base, armL: 6, armR: -6, legL: 2, legR: -2, headTilt: 7, face: "sleep" },
  gym: { ...base, armL: 100, armR: -100, elbL: 80, elbR: -80, legL: 7, legR: -7, face: "effort", fore: 26, armsFront: true },
  running: { ...base, armL: 30, armR: -30, elbL: -95, elbR: 95, legL: 20, legR: -20, face: "happy" },
  pilates: { ...base, armL: 168, armR: -18, elbL: -125, elbR: 0, legL: 2, legR: -38, headTilt: 12, face: "happy", lying: LYING, floorAt: 0.7 },
  climbing: { ...base, armL: 132, armR: -70, elbL: 18, elbR: -70, legL: 30, legR: -6, offsetY: -2, face: "happy", fore: 15 },
  // 등을 대고 누워 더미 허리를 두 다리로 감고(클로즈드 가드) 두 손으로 깃을 잡는다
  jiujitsu: { ...base, armL: -52, armR: -60, legL: -26, legR: -54, torso: 12, headTilt: -5, face: "happy", fore: 21, lying: "translate(33 -14) rotate(-90 60 100)", floorAt: 0.89, uniform: "gi", dummy: true },
  // 겨루기 자세(주먹 가드)에서 앞차기
  taekwondo: { ...base, armL: 30, armR: -30, elbL: -140, elbR: 140, legL: 13, legR: -13, face: "smile", uniform: "dobok" },
};
