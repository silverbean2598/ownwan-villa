/**
 * 프리미엄 상품: 포인트가 아니라 돈(원)으로 사는 방 테마.
 * - 테마는 방 벽지를 바꾸고 테마 장식을 함께 놓는다. 장식은 테마에 딸려 있어 내 가구 5칸은 그대로다.
 * - 한 번 사면 계속 갖고, 언제든 켜고 끌 수 있다 (켜 둔 테마는 하나).
 * - 결제는 아직 연결하지 않았다. 구매 버튼은 안내만 한다 (PREMIUM_PAY_READY).
 */
export const THEME_IDS = ["xmas"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type PremiumTheme = {
  id: ThemeId;
  kind: "theme";
  name: string;
  /** 원 단위 가격 */
  priceWon: number;
  /** 시즌 한정 표시 */
  season?: string;
  /** 목록 카드 한 줄 소개 */
  tagline: string;
  /** 상세 화면 "들어 있는 것" */
  includes: string[];
};

export const PREMIUM_THEMES: PremiumTheme[] = [
  {
    id: "xmas",
    kind: "theme",
    name: "크리스마스 테마",
    priceWon: 1000,
    season: "시즌 한정",
    tagline: "눈꽃 벽지에 벽난로 · 리스 · 선물까지, 방 전체가 크리스마스로 바뀌어요.",
    includes: ["눈꽃 · 호랑가시 벽지", "가랜드", "리스", "벽난로", "선물 더미", "눈사람", "크리스마스 러그"],
  },
];

/** 결제가 아직 연결되지 않았다: 구매 버튼은 이 안내만 보여 준다 */
export const PREMIUM_PAY_READY = false;
export const PAY_NOT_READY_MESSAGE = "결제 준비 중이에요. 곧 열려요!";

export function isThemeId(v: unknown): v is ThemeId {
  return (THEME_IDS as readonly unknown[]).includes(v);
}

export function findTheme(id: unknown): PremiumTheme | undefined {
  return PREMIUM_THEMES.find((t) => t.id === id);
}

/** 1000 → "1,000원" */
export const formatWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;
