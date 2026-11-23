import type { ReactNode } from "react";
import { DEFAULT_AVATAR, parseAvatar, type AvatarSpec } from "../../../shared/avatar";
import { SpriteAvatar } from "../avatar2/SpriteAvatar";
import { spriteBox } from "../avatar2/layers";
import type { Pose } from "../avatar2/pose";
import { INK } from "../ink";
import type { CardType, ToastType } from "../../events/plan";
import {
  Box, Bubbles, Burst, ClapLines, Confetti, Crown, Heart, Key, Letter, MiniApartment, MiniVilla, Moon, Plant, PlusOne, Shadow, Sparkle, Stairs, Trophy, UpArrow,
} from "./props";

/**
 * 축하 · 알림 그림의 캐릭터 기분 → 그림 자세.
 * cheer: 웅크렸다 만세 점프 · 착지 / sad: 눈물 → 한숨 → 주먹 쥐고 다짐 / idle: 서서 숨쉬기
 */
type Mood = Extract<Pose, "cheer" | "sad" | "idle">;

/** 카드 그림의 기분 (variant: league_rank "1"~"3", battle_result won · lost · draw) */
export function cardMood(type: CardType, variant?: string): Mood {
  switch (type) {
    case "streak7":
    case "floor_up":
    case "penthouse_in":
    case "welcome":
    case "owner_in":
    case "league_rank":
    case "apartment_promoted":
      return "cheer";
    case "penthouse_out":
    case "floor_down":
    case "kicked":
    case "dissolved":
    case "application_rejected":
      return "sad";
    case "battle_result":
      return variant === "won" ? "cheer" : variant === "lost" ? "sad" : "idle";
    case "battle_challenged":
      return "idle";
  }
}

/** 토스트 그림의 기분 (내 캐릭터) */
export function toastMood(type: ToastType): Mood {
  switch (type) {
    case "certified":
    case "cheered":
    case "bought":
    case "owner_changed":
    case "friend_joined":
      return "cheer";
    case "application_closed":
    case "battle_declined":
    case "battle_expired":
    case "battle_cancelled":
      return "sad";
    default:
      return "idle";
  }
}

/** 바닥에 세운 우승컵 (손에 쥐던 크기의 1.3배). (x, y) = 받침 아래 가운데 */
function FloorTrophy({ x, y = FLOOR, metal }: { x: number; y?: number; metal?: "gold" | "silver" | "bronze" }) {
  return (
    <g transform={`translate(${x} ${y}) scale(1.3)`}>
      <Trophy x={0} y={0} metal={metal} />
    </g>
  );
}

/** 카드 바닥 줄 (y) */
const FLOOR = 181;

/** 장면 좌표에 새 캐릭터를 놓는다. (cx, floor) = 발 가운데 · 바닥. size 120 = 카드 크기(키 ≈ 156) */
function Figure({ cx, floor = FLOOR, spec, pose, size = 120 }: { cx: number; floor?: number; spec: AvatarSpec; pose: Mood; size?: number }) {
  const b = spriteBox(pose, size);
  return <SpriteAvatar spec={spec} size={size} pose={pose} x={cx - b.w / 2} y={floor - b.floor} label="" />;
}

const CONFETTI: [number, number, number][] = [
  [30, 40, 20], [48, 22, -30], [196, 26, 35], [212, 58, -20], [24, 84, -45], [40, 120, 30],
  [208, 104, 50], [218, 140, -15], [74, 14, 60], [176, 12, -50], [20, 150, 15], [196, 168, 40],
];

/**
 * 전체 화면 카드 그림 (240 × 200). spec = 보는 사람 자신의 캐릭터.
 * 캐릭터는 그림 띠라 손 위치가 칸마다 달라, 소품(컵 · 상자 · 열쇠 · 편지)은 손에 쥐지 않고 옆 바닥 · 공중에 둔다
 */
export function CardArt({ type, spec, variant }: { type: CardType; spec: AvatarSpec; /** league_rank: "1"~"3", battle_result: won · lost · draw */ variant?: string }) {
  const s = parseAvatar(spec) ?? DEFAULT_AVATAR;
  const pose = cardMood(type, variant);
  const me = (cx = 120, floor = FLOOR) => <Figure cx={cx} floor={floor} spec={s} pose={pose} />;
  let body: ReactNode;
  switch (type) {
    case "streak7": {
      // 만세 점프 + 옆에 우승컵 + 색종이
      body = (
        <>
          <Confetti pieces={CONFETTI} />
          <Shadow x={104} y={FLOOR} />
          {me(104)}
          <Shadow x={190} y={FLOOR} rx={18} />
          <FloorTrophy x={190} />
          <Sparkle cx={214} cy={100} r={7} />
          <Sparkle cx={166} cy={110} r={4} />
          <Sparkle cx={34} cy={62} r={5} />
        </>
      );
      break;
    }
    case "floor_up": {
      // 만세 점프 + "+1" + 위 화살표
      body = (
        <>
          <Shadow x={120} y={FLOOR} rx={26} />
          {me()}
          <PlusOne x={22} y={92} />
          <UpArrow x={210} y={40} />
          <Sparkle cx={196} cy={30} r={8} />
          <Sparkle cx={222} cy={22} r={4.5} />
          <Sparkle cx={226} cy={52} r={4} />
        </>
      );
      break;
    }
    case "penthouse_in": {
      // 이삿짐(상자 + 화분)을 옆에 두고 만세. 머리 위로 왕관이 반짝
      body = (
        <>
          <Shadow x={100} y={FLOOR} />
          {me(100)}
          <Shadow x={186} y={FLOOR} rx={26} />
          <Box x={184} y={FLOOR - 17} w={42} h={34} />
          <Plant x={194} y={FLOOR - 34} />
          <Crown x={178} y={58} rot={12} />
          <Sparkle cx={206} cy={44} r={6} />
          <Sparkle cx={158} cy={44} r={4} />
          <Sparkle cx={30} cy={56} r={5} />
        </>
      );
      break;
    }
    case "penthouse_out": {
      // 시무룩, 왕관이 날아간다
      body = (
        <>
          <Shadow x={110} y={FLOOR} />
          {me(110)}
          <Burst x={52} y={62} dir={-1} />
          <g className="cel-fly">
            <Crown x={200} y={40} rot={28} />
            <path d="M172 60 l-10 6 M178 68 l-9 5 M168 52 l-8 4" stroke="#C9C3C1" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </>
      );
      break;
    }
    case "floor_down": {
      // 계단을 한 칸 내려와 시무룩. 이삿짐 상자는 아래 계단에
      body = (
        <>
          <Stairs x={0} y={126} steps={5} run={48} rise={16} bottom={200} />
          {me(116, 158)}
          <Box x={216} y={190 - 15} w={34} h={28} />
        </>
      );
      break;
    }
    case "welcome": {
      // 입주 환영: 만세 + 하트
      body = (
        <>
          <Shadow x={120} y={FLOOR} />
          {me()}
          <Heart x={194} y={62} s={1.1} />
          <Heart x={210} y={88} s={0.7} />
          <Sparkle cx={38} cy={56} r={5.5} />
          <Sparkle cx={50} cy={92} r={3.5} />
        </>
      );
      break;
    }
    case "kicked": {
      // 아파트를 등지고 나와 시무룩, 상자는 발 옆에
      body = (
        <>
          <MiniVilla x={40} y={176} w={52} />
          <Shadow x={124} y={FLOOR} />
          {me(124)}
          <Box x={194} y={FLOOR - 15} w={38} h={30} />
          <Bubbles x={196} y={70} />
        </>
      );
      break;
    }
    case "owner_in": {
      // 방장 열쇠가 머리 위에서 반짝, 만세
      body = (
        <>
          <Shadow x={110} y={FLOOR} />
          {me(110)}
          <Key x={186} y={60} rot={-35} />
          <Sparkle cx={212} cy={36} r={7} />
          <Sparkle cx={222} cy={78} r={4} />
          <Sparkle cx={34} cy={60} r={5} />
        </>
      );
      break;
    }
    case "dissolved": {
      // 불 꺼진 아파트 앞에서 아쉬워한다
      body = (
        <>
          <MiniVilla x={188} y={178} w={60} />
          <Shadow x={92} y={FLOOR} />
          {me(92)}
          <Heart x={150} y={66} s={0.8} color="#E6E2E0" />
        </>
      );
      break;
    }
    case "application_rejected": {
      // 답장 편지를 받고 아쉽지만 다시 힘내자. 멀리 다른 아파트들
      body = (
        <>
          <MiniVilla x={200} y={150} w={40} floors={2} />
          <MiniVilla x={224} y={162} w={30} floors={2} />
          <Shadow x={100} y={FLOOR} />
          {me(100)}
          <Letter x={166} y={78} rot={-12} />
          <Heart x={182} y={56} s={0.7} />
        </>
      );
      break;
    }
    case "league_rank": {
      // 연속 기록 카드처럼 옆에 컵. 컵 색 = 순위 (금 · 은 · 동)
      const metal = variant === "2" ? "silver" : variant === "3" ? "bronze" : "gold";
      body = (
        <>
          <Confetti pieces={CONFETTI} />
          <MiniVilla x={214} y={178} w={40} floors={2} />
          <Shadow x={96} y={FLOOR} />
          {me(96)}
          <Shadow x={166} y={FLOOR} rx={16} />
          <FloorTrophy x={166} metal={metal} />
          <Sparkle cx={34} cy={62} r={5} />
        </>
      );
      break;
    }
    case "battle_challenged": {
      // 도전장(편지)이 날아왔다. 뒤에 아파트 두 채가 마주 본다
      body = (
        <>
          <MiniVilla x={200} y={150} w={40} floors={3} />
          <MiniVilla x={228} y={162} w={28} floors={2} />
          <Burst x={206} y={84} dir={1} color="#F39A5B" />
          <Shadow x={100} y={FLOOR} />
          {me(100)}
          <Letter x={154} y={100} rot={-12} />
        </>
      );
      break;
    }
    case "apartment_promoted": {
      // 우리 아파트가 타워팰리스가 됐다: 만세 + 색종이, 뒤에 금색 돔을 얹은 높은 타워팰리스
      body = (
        <>
          <Confetti pieces={CONFETTI} />
          <MiniApartment x={196} y={182} w={60} floors={9} />
          <Shadow x={90} y={FLOOR} rx={26} />
          {me(90)}
          <Sparkle cx={226} cy={34} r={7} />
          <Sparkle cx={160} cy={30} r={4.5} />
          <Sparkle cx={22} cy={60} r={5} />
        </>
      );
      break;
    }
    case "battle_result": {
      if (variant === "won") {
        // 이겼다: 만세 + 컵 + 색종이
        body = (
          <>
            <Confetti pieces={CONFETTI} />
            <Shadow x={104} y={FLOOR} />
            {me(104)}
            <Shadow x={190} y={FLOOR} rx={18} />
            <FloorTrophy x={190} />
            <UpArrow x={216} y={50} />
          </>
        );
      } else if (variant === "lost") {
        // 졌다: 아쉽지만 주먹 쥐고 다음을 다짐 (sad 마지막 칸)
        body = (
          <>
            <Shadow x={120} y={FLOOR} />
            {me()}
            <Bubbles x={196} y={70} />
          </>
        );
      } else {
        // 무승부: 박수
        body = (
          <>
            <Shadow x={120} y={FLOOR} />
            {me()}
            <ClapLines x={180} y={96} />
            <ClapLines x={60} y={96} />
            <Sparkle cx={196} cy={50} r={6} />
          </>
        );
      }
      break;
    }
  }
  return (
    <svg className={`cel-art cel-${type}`} data-mood={pose} viewBox="0 0 240 200" width="100%" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      {body}
    </svg>
  );
}

/** 토스트 그림 안에서 상반신을 놓는다: (cx, top) = 머리 가운데 · 그림 위끝, w = 칸 가로(서 있는 그림 기준) */
function Bust({ spec, pose, cx, top, w }: { spec: AvatarSpec; pose: Mood; cx: number; top: number; w: number }) {
  // 자세마다 칸 크기가 달라도 머리 크기는 같게: 서 있는 그림 칸 가로가 w 가 되는 size
  const size = w / spriteBox("idle", 1).w;
  const b = spriteBox(pose, size);
  return <SpriteAvatar spec={spec} size={size} pose={pose} x={cx - b.w / 2} y={top} label="" />;
}

/** 얼굴 · 상반신만 잘라 보이는 작은 그림 (토스트). 좌표는 옛 그림과 같은 14 4 92 92 (소품 위치 그대로) */
function Head({ spec, pose, children }: { spec: AvatarSpec; pose: Mood; children?: ReactNode }) {
  return (
    <svg className="toast-art" data-mood={pose} viewBox="14 4 92 92" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <Bust spec={spec} pose={pose} cx={60} top={6} w={92} />
      {children}
    </svg>
  );
}

/** 두 사람 토스트 (나 + 친구). 좌표 16 18 152 104 */
function Pair({ spec, friend, pose, friendPose, children }: { spec: AvatarSpec; friend?: AvatarSpec | null; pose: Mood; friendPose: Mood; children?: ReactNode }) {
  const f = parseAvatar(friend) ?? DEFAULT_AVATAR;
  return (
    <svg className="toast-art wide" data-mood={pose} viewBox="16 18 152 104" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <Bust spec={spec} pose={pose} cx={60} top={22} w={84} />
      <Bust spec={f} pose={friendPose} cx={124} top={22} w={84} />
      {children}
    </svg>
  );
}

/** 토스트 왼쪽 그림. friend = 새로 들어온 이웃 · 새 방장 · 신청한 사람 캐릭터(없으면 기본) */
export function ToastArt({ type, spec, friend }: { type: ToastType; spec: AvatarSpec; friend?: AvatarSpec | null }) {
  const pose = toastMood(type);
  switch (type) {
    case "certified":
      return (
        <Head spec={spec} pose={pose}>
          <Sparkle cx={22} cy={40} r={6} />
          <Sparkle cx={98} cy={22} r={7} />
        </Head>
      );
    case "streak6":
      return <Head spec={spec} pose={pose} />;
    case "cheered":
      return (
        <Head spec={spec} pose={pose}>
          <Heart x={24} y={30} s={1.1} />
          <Heart x={97} y={20} s={0.95} />
        </Head>
      );
    case "commented":
      // 말풍선을 받는다
      return (
        <Head spec={spec} pose={pose}>
          <path d="M81 10 h18 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-10 l-5 5 v-5 h-3 a5 5 0 0 1 -5 -5 v-8 a5 5 0 0 1 5 -5 Z" fill="#fff" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M85 17 h10 M85 22 h6" stroke="#9AA4B5" strokeWidth="1.4" strokeLinecap="round" />
        </Head>
      );
    case "bought":
      return (
        <Head spec={spec} pose={pose}>
          <path d="M22 30 l-5 -3 M21 38 h-6 M100 30 l5 -3 M101 38 h6" stroke="#F39A5B" strokeWidth="1.6" strokeLinecap="round" />
        </Head>
      );
    case "night_reminder":
      return (
        <Head spec={spec} pose={pose}>
          <Bubbles x={24} y={30} />
          <Moon x={96} y={16} r={7} />
        </Head>
      );
    case "owner_changed":
      // 나는 만세, 새 방장 옆에 열쇠
      return (
        <Pair spec={spec} friend={friend} pose={pose} friendPose="cheer">
          <Key x={150} y={30} rot={-45} />
        </Pair>
      );
    case "application_received":
      // 신청한 사람이 편지를 보냈다
      return (
        <Pair spec={spec} friend={friend} pose={pose} friendPose="idle">
          <Letter x={92} y={28} s={0.7} rot={-10} />
        </Pair>
      );
    case "battle_started":
      return (
        <Head spec={spec} pose={pose}>
          <Burst x={22} y={42} dir={-1} color="#F39A5B" />
          <Burst x={98} y={42} dir={1} color="#F39A5B" />
        </Head>
      );
    case "battle_declined":
    case "battle_expired":
    case "battle_cancelled":
    case "application_closed":
      return (
        <Head spec={spec} pose={pose}>
          <Letter x={98} y={24} s={0.55} rot={14} />
        </Head>
      );
    case "friend_joined":
      return (
        <Pair spec={spec} friend={friend} pose={pose} friendPose="cheer">
          <ClapLines x={92} y={36} />
        </Pair>
      );
  }
}
