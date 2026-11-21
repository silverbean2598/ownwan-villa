import type { Sport } from "./sports";

export const SLOTS = ["wall1", "wall2", "floor1", "floor2", "floor3"] as const;
export type Slot = (typeof SLOTS)[number];
export type SlotType = "floor" | "wall";

/** 상점 물건 종류: 방에 놓는 가구 / 캐릭터가 입는 옷 / 몸에 하나씩 거는 소품 */
export type ItemKind = "furniture" | "outfit" | "accessory";
/** 확장 가구의 상점 묶음 (1차 가구는 종목으로 묶는다) */
export const FURNITURE_CATEGORIES = ["운동 기구", "휴식 가구", "계절·특별", "펜트하우스 전용"] as const;
export type FurnitureCategory = (typeof FURNITURE_CATEGORIES)[number];

/** 가구 */
export type Item = {
  id: string;
  name: string;
  kind: "furniture";
  sport: Sport | "common";
  slotType: SlotType;
  price: number;
  category?: FurnitureCategory;
  /** 지금 펜트하우스에 사는 사람만 살 수 있다(산 뒤에는 계속 갖고 어디든 놓을 수 있다) */
  penthouseOnly?: true;
};

/** 소품을 거는 몸 자리. 자리마다 하나씩만 낄 수 있다 */
export const ACC_SLOTS = ["head", "face", "neck", "shoulder", "wrist"] as const;
export type AccSlot = (typeof ACC_SLOTS)[number];

export type OutfitItem = { id: string; name: string; kind: "outfit"; price: number };
export type AccessoryItem = { id: string; name: string; kind: "accessory"; accSlot: AccSlot; price: number };
export type ShopItem = Item | OutfitItem | AccessoryItem;

const f = (id: string, name: string, sport: Sport | "common", slotType: SlotType, price: number): Item => ({ id, name, kind: "furniture", sport, slotType, price });

/** 1차 가구 31종: 공용 7 + 종목마다 3 (8종목) (종목별 상점 묶음용). 가구 전체는 FURNITURE */
export const BASE_FURNITURE: Item[] = [
  f("plant", "화분", "common", "floor", 80),
  f("rug", "러그", "common", "floor", 100),
  f("floor-lamp", "스탠드 조명", "common", "floor", 120),
  f("landscape-frame", "풍경 액자", "common", "wall", 60),
  f("owunwan-frame", "\"오운완\" 문구 액자", "common", "wall", 60),
  f("wall-clock", "벽시계", "common", "wall", 80),
  f("trophy-shelf", "트로피 선반", "common", "wall", 150),
  f("bench", "벤치", "gym", "floor", 120),
  f("dumbbell-rack", "덤벨 랙", "gym", "floor", 150),
  f("full-mirror", "전신 거울", "gym", "wall", 100),
  f("reformer", "리포머", "pilates", "floor", 200),
  f("gym-ball", "짐볼", "pilates", "floor", 80),
  f("foam-roller", "폼롤러", "pilates", "floor", 60),
  f("yoga-blocks", "요가 블록", "yoga", "floor", 60),
  f("meditation-cushion", "명상 쿠션", "yoga", "floor", 80),
  f("singing-bowl", "싱잉볼", "yoga", "floor", 100),
  f("pushup-bars", "푸시업 바", "hometraining", "floor", 60),
  f("step-box", "스텝박스", "hometraining", "floor", 90),
  // 꾸미기 확장의 "줄넘기 걸이"(jump-rope-hook)와 다른 가구: 홈트 묶음의 나무 고리 줄넘기
  f("jump-rope-wall", "홈트 줄넘기", "hometraining", "wall", 60),
  f("shoe-shelf", "러닝화 선반", "running", "floor", 80),
  f("bottle-stand", "물병 거치대", "running", "floor", 60),
  f("medal-frame", "완주 메달 액자", "running", "wall", 100),
  f("crash-pad", "크래시패드", "climbing", "floor", 120),
  f("mini-wall", "미니 볼더링 벽", "climbing", "wall", 180),
  f("chalk-hook", "초크백 걸이", "climbing", "wall", 60),
  f("grappling-dummy", "그래플링 더미", "jiujitsu", "floor", 150),
  f("gi-hanger", "도복 걸이", "jiujitsu", "wall", 80),
  f("belt-frame", "띠 액자", "jiujitsu", "wall", 100),
  f("sandbag", "샌드백", "taekwondo", "floor", 150),
  f("kick-paddle-stand", "발차기 미트 거치대", "taekwondo", "floor", 100),
  f("board-frame", "격파 송판 액자", "taekwondo", "wall", 100),
];

const x = (id: string, name: string, category: FurnitureCategory, slotType: SlotType, price: number): Item => ({ ...f(id, name, "common", slotType, price), category });

/** 꾸미기 확장 가구 24종 (모두 공용). 크고 귀한 것일수록 비싸다 */
export const EXTRA_FURNITURE: Item[] = [
  // 운동 기구 60~200P
  x("shaker-stand", "단백질 쉐이커 거치대", "운동 기구", "floor", 60),
  x("blender", "블렌더", "운동 기구", "floor", 80),
  x("mini-fridge", "미니 냉장고", "운동 기구", "floor", 130),
  x("yoga-set", "요가 블록·매트 세트", "운동 기구", "floor", 90),
  x("kettlebell-set", "케틀벨 세트", "운동 기구", "floor", 110),
  x("jump-rope-hook", "줄넘기 걸이", "운동 기구", "wall", 60),
  x("pullup-bar", "철봉", "운동 기구", "floor", 160),
  x("rowing-machine", "로잉머신", "운동 기구", "floor", 200),
  x("spin-bike", "실내 자전거", "운동 기구", "floor", 190),
  x("stretch-frame", "스트레칭 액자", "운동 기구", "wall", 70),
  // 휴식 가구 80~180P
  x("heart-neon", "하트 네온사인", "휴식 가구", "wall", 120),
  x("bookshelf", "책장", "휴식 가구", "floor", 150),
  x("gaming-chair", "게이밍 의자", "휴식 가구", "floor", 170),
  x("beanbag", "빈백", "휴식 가구", "floor", 100),
  x("aquarium", "어항", "휴식 가구", "floor", 180),
  x("cat-bed", "고양이 침대", "휴식 가구", "floor", 140),
  x("dog-bed", "강아지 침대", "휴식 가구", "floor", 140),
  // 계절·특별 60~150P
  x("xmas-tree", "크리스마스 트리", "계절·특별", "floor", 150),
  x("jack-o-lantern", "할로윈 호박등", "계절·특별", "floor", 90),
  x("cherry-vase", "벚꽃 화병", "계절·특별", "floor", 70),
  x("fan", "선풍기", "계절·특별", "floor", 80),
  x("heater", "난로", "계절·특별", "floor", 100),
  x("string-lights", "전구 줄조명", "계절·특별", "wall", 60),
  // 펜트하우스 전용
  { ...x("gold-statue", "황금 조각상", "펜트하우스 전용", "floor", 300), penthouseOnly: true },
];

/** 방에 놓을 수 있는 가구 전체 (1차 31종 + 확장 24종). 가구 목록이 필요한 곳은 BASE_FURNITURE 가 아니라 이걸 쓴다 */
export const FURNITURE: Item[] = [...BASE_FURNITURE, ...EXTRA_FURNITURE];

/** 옷(100~150P). 안 산 기본 옷은 반팔 티 + 반바지. 옷 색(shirt)이 윗옷 색이 된다 */
export const OUTFITS: OutfitItem[] = [
  { id: "tank-joggers", name: "민소매 · 조거", kind: "outfit", price: 120 },
  { id: "hoodie", name: "후드티", kind: "outfit", price: 140 },
  { id: "sports-bra-leggings", name: "스포츠 브라 · 레깅스", kind: "outfit", price: 130 },
  { id: "singlet", name: "러닝 싱글렛", kind: "outfit", price: 110 },
  { id: "cycling-jersey", name: "사이클 저지", kind: "outfit", price: 140 },
  { id: "rashguard", name: "래시가드", kind: "outfit", price: 150 },
];

/** 소품(50~80P). 몸 자리마다 하나씩 */
export const ACCESSORIES: AccessoryItem[] = [
  { id: "headband", name: "헤어밴드", kind: "accessory", accSlot: "head", price: 50 },
  { id: "cap", name: "모자", kind: "accessory", accSlot: "head", price: 70 },
  { id: "glasses", name: "안경", kind: "accessory", accSlot: "face", price: 60 },
  { id: "earphones", name: "목 이어폰", kind: "accessory", accSlot: "neck", price: 80 },
  { id: "towel", name: "어깨 수건", kind: "accessory", accSlot: "shoulder", price: 60 },
  { id: "wristbands", name: "손목 밴드", kind: "accessory", accSlot: "wrist", price: 50 },
  { id: "chicken", name: "치킨", kind: "accessory", accSlot: "wrist", price: 60 },
];

export const SHOP_ITEMS: ShopItem[] = [...FURNITURE, ...OUTFITS, ...ACCESSORIES];

/** 가구만 찾는다 (방 배치용) */
export function findItem(id: unknown): Item | undefined {
  return FURNITURE.find((i) => i.id === id);
}

/** 가구 · 옷 · 소품 어느 것이든 찾는다 (상점용) */
export function findShopItem(id: unknown): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export const findOutfit = (id: unknown) => OUTFITS.find((i) => i.id === id);
export const findAccessory = (id: unknown) => ACCESSORIES.find((i) => i.id === id);

/** 물건 종류의 이름 (오류 · 안내 문구) */
export const KIND_NOUN: Record<ItemKind, string> = { furniture: "가구", outfit: "옷", accessory: "소품" };

export function slotType(slot: Slot): SlotType {
  return slot.startsWith("wall") ? "wall" : "floor";
}

export function isSlot(s: unknown): s is Slot {
  return (SLOTS as readonly unknown[]).includes(s);
}
