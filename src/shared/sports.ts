export const SPORTS = ["gym", "pilates", "running", "climbing", "jiujitsu", "taekwondo"] as const;
export type Sport = (typeof SPORTS)[number];

export const SPORT_LABEL: Record<Sport, string> = {
  gym: "헬스",
  pilates: "필라테스",
  running: "러닝",
  climbing: "클라이밍",
  jiujitsu: "주짓수",
  taekwondo: "태권도",
};
