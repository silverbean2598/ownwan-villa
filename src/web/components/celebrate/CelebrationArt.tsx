import type { ReactNode } from "react";
import { AVATAR_OPTIONS, DEFAULT_AVATAR, parseAvatar, type AvatarSpec } from "../../../shared/avatar";
import { Avatar, type Face } from "../Avatar";
import { INK, handAt } from "../avatar/parts";
import type { CardType, ToastType } from "../../events/plan";
import {
  Box, Bubbles, Burst, ClapLines, Confetti, Crown, Heart, Key, MiniVilla, Moon, Plant, PlusOne, Shadow, Sparkle, Stairs, Trophy, UpArrow,
} from "./props";

type AvatarProps = Parameters<typeof Avatar>[0];

/** 장면 좌표에 리그 캐릭터를 놓는다 (리그 좌표 1 = 장면 좌표 1) */
function Figure({ x, y, className, ...p }: { x: number; y: number; className?: string } & Omit<AvatarProps, "size">) {
  return (
    <g transform={`translate(${x} ${y})`} className={className}>
      <Avatar size={120} {...p} />
    </g>
  );
}

/** 소품을 쥔 손(벙어리장갑)을 소품 위에 다시 그린다 (팔은 소품 뒤, 손은 앞). 외곽선은 팔다리와 같은 굵기로 바깥에만 */
function Fist({ at, skin }: { at: [number, number]; skin: string }) {
  return <circle cx={at[0]} cy={at[1]} r="5.8" fill={skin} stroke={INK} strokeWidth="3.2" paintOrder="stroke" />;
}

const add = (p: [number, number], x: number, y: number): [number, number] => [p[0] + x, p[1] + y];

const CONFETTI: [number, number, number][] = [
  [30, 40, 20], [48, 22, -30], [196, 26, 35], [212, 58, -20], [24, 84, -45], [40, 120, 30],
  [208, 104, 50], [218, 140, -15], [74, 14, 60], [176, 12, -50], [20, 150, 15], [196, 168, 40],
];

/** 전체 화면 카드 그림 (240 × 200). spec = 보는 사람 자신의 캐릭터 */
export function CardArt({ type, spec }: { type: CardType; spec: AvatarSpec }) {
  const s = parseAvatar(spec) ?? DEFAULT_AVATAR;
  const skin = AVATAR_OPTIONS.skin[s.skin];
  let body: ReactNode;
  switch (type) {
    case "streak7": {
      // 트로피를 번쩍 들고 감동의 눈물 + 색종이
      const X = 60, Y = 24;
      const hand = add(handAt("R", -128, 0), X, Y);
      body = (
        <>
          <Confetti pieces={CONFETTI} />
          <Shadow x={120} y={181} />
          <Figure x={X} y={Y} spec={s} face="tears" joints={{ armR: -128, elbR: 0, armL: 22 }} />
          <Trophy x={hand[0]} y={hand[1] + 4} />
          <Fist at={hand} skin={skin} />
          <Sparkle cx={190} cy={44} r={7} />
          <Sparkle cx={40} cy={62} r={5} />
        </>
      );
      break;
    }
    case "floor_up": {
      // 두 팔 벌려 점프 + "+1" + 위 화살표
      body = (
        <>
          <Shadow x={120} y={186} rx={24} className="cel-shadow" />
          <g className="cel-jump">
            <Figure x={60} y={2} spec={s} face="happy" joints={{ armL: 128, armR: -128, elbL: 28, elbR: -28, legL: 26, legR: -34 }} />
          </g>
          <PlusOne x={26} y={74} />
          <UpArrow x={204} y={36} />
          <Sparkle cx={190} cy={26} r={8} />
          <Sparkle cx={216} cy={20} r={4.5} />
          <Sparkle cx={222} cy={48} r={4} />
        </>
      );
      break;
    }
    case "penthouse_in": {
      // 선글라스 끼고 이삿짐(상자 + 화분) 들고 입주
      const X = 60, Y = 22;
      const plantHand = add(handAt("R", -28, 0), X, Y);
      body = (
        <>
          <Shadow x={120} y={179} rx={34} />
          <Figure x={X} y={Y} spec={s} face="cool" joints={{ armL: 18, elbL: -70, armR: -28, elbR: 0 }} />
          <Box x={100} y={128} w={38} h={34} />
          <Fist at={[84, 140]} skin={skin} />
          <Plant x={plantHand[0] + 3} y={plantHand[1] - 4} />
          <Fist at={plantHand} skin={skin} />
          <Sparkle cx={184} cy={60} r={7} />
          <Sparkle cx={196} cy={80} r={4} />
          <Sparkle cx={50} cy={50} r={5} />
        </>
      );
      break;
    }
    case "penthouse_out": {
      // 깜짝 놀란 얼굴, 왕관이 날아간다
      body = (
        <>
          <Shadow x={120} y={181} />
          <Figure x={60} y={24} spec={s} face="shocked" joints={{ armL: 42, armR: -42, elbL: 60, elbR: -60 }} />
          <Burst x={160} y={58} dir={1} />
          <Burst x={80} y={58} dir={-1} />
          <g className="cel-fly">
            <Crown x={200} y={42} rot={28} />
            <path d="M172 62 l-10 6 M178 70 l-9 5 M168 54 l-8 4" stroke="#C9C3C1" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </>
      );
      break;
    }
    case "floor_down": {
      // 상자를 안고 계단을 한 칸 내려간다
      const X = 60, Y = -6;
      body = (
        <>
          <Stairs x={0} y={118} steps={5} run={48} rise={16} bottom={200} />
          <Figure x={X} y={Y} spec={s} face="sad" joints={{ armL: 20, elbL: -80, armR: -20, elbR: 80, legL: 2, legR: -2 }} />
          <Box x={118} y={104} w={42} h={34} />
          <Fist at={[99, 114]} skin={skin} />
          <Fist at={[137, 114]} skin={skin} />
        </>
      );
      break;
    }
    case "welcome": {
      // 수줍게 손 흔들며 인사
      body = (
        <>
          <Shadow x={120} y={181} />
          <g className="cel-wave">
            <Figure x={60} y={24} spec={s} face="shy" joints={{ armR: -150, elbR: 25, armL: 10 }} />
          </g>
          <Heart x={186} y={60} s={1.1} />
          <Heart x={200} y={86} s={0.7} />
          <Sparkle cx={46} cy={56} r={5.5} />
        </>
      );
      break;
    }
    case "kicked": {
      // 상자를 안고 힘없이 빌라를 등지고 걸어 나온다
      const X = 74, Y = 24;
      body = (
        <>
          <MiniVilla x={44} y={176} w={52} />
          <Shadow x={134} y={181} rx={34} />
          <Figure x={X} y={Y} spec={s} face="sad" joints={{ armL: 20, elbL: -80, armR: -20, elbR: 80, legL: 6, legR: -8 }} />
          <Box x={134} y={130} w={42} h={34} />
          <Fist at={[113, 140]} skin={skin} />
          <Fist at={[151, 140]} skin={skin} />
          <Bubbles x={196} y={58} />
        </>
      );
      break;
    }
    case "owner_in": {
      // 방장 열쇠를 번쩍 들고 뿌듯한 얼굴
      const X = 60, Y = 24;
      const hand = add(handAt("R", -128, 0), X, Y);
      body = (
        <>
          <Shadow x={120} y={181} />
          <Figure x={X} y={Y} spec={s} face="proud" joints={{ armR: -128, elbR: 0, armL: 22 }} />
          <Key x={hand[0] + 2} y={hand[1] - 12} rot={-60} />
          <Fist at={hand} skin={skin} />
          <Sparkle cx={196} cy={40} r={7} />
          <Sparkle cx={214} cy={66} r={4} />
          <Sparkle cx={40} cy={60} r={5} />
        </>
      );
      break;
    }
    case "dissolved": {
      // 불 꺼진 빌라 앞에서 아쉽게 손 흔들며 작별
      body = (
        <>
          <MiniVilla x={186} y={178} w={60} />
          <Shadow x={96} y={181} />
          <g className="cel-wave">
            <Figure x={36} y={24} spec={s} face="sad" joints={{ armR: -150, elbR: 25, armL: 10 }} />
          </g>
          <Heart x={150} y={70} s={0.8} color="#E6E2E0" />
        </>
      );
      break;
    }
  }
  return (
    <svg className={`cel-art cel-${type}`} viewBox="0 0 240 200" width="100%" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      {body}
    </svg>
  );
}

/** 얼굴만 잘라 보이는 작은 그림 (토스트) */
function Head({ spec, face, joints, children, box = "14 4 92 92" }: { spec: AvatarSpec; face: Face; joints?: AvatarProps["joints"]; children?: ReactNode; box?: string }) {
  return (
    <svg className="toast-art" viewBox={box} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <Avatar size={120} spec={spec} face={face} joints={joints} />
      {children}
    </svg>
  );
}

/** 토스트 왼쪽 그림. friend = 새로 들어온 이웃 · 새 방장 캐릭터(없으면 기본) */
export function ToastArt({ type, spec, friend }: { type: ToastType; spec: AvatarSpec; friend?: AvatarSpec | null }) {
  switch (type) {
    case "certified":
      return (
        <Head spec={spec} face="proud">
          <Sparkle cx={22} cy={48} r={6} />
          <Sparkle cx={98} cy={30} r={7} />
          <Sparkle cx={100} cy={56} r={4} />
        </Head>
      );
    case "streak6":
      return <Head spec={spec} face="determined" />;
    case "cheered":
      return (
        <Head spec={spec} face="love">
          <Heart x={25} y={46} s={1.1} />
          <Heart x={95} y={30} s={0.95} />
          <Heart x={97} y={58} s={0.8} />
        </Head>
      );
    case "commented":
      // 웃으며 말풍선을 받는다
      return (
        <Head spec={spec} face="laugh">
          <path d="M81 22 h18 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-10 l-5 5 v-5 h-3 a5 5 0 0 1 -5 -5 v-8 a5 5 0 0 1 5 -5 Z" fill="#fff" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M85 29 h10 M85 34 h6" stroke="#9AA4B5" strokeWidth="1.4" strokeLinecap="round" />
        </Head>
      );
    case "bought":
      return (
        <Head spec={spec} face="laugh">
          <path d="M20 58 l-5 -3 M19 66 h-6 M20 74 l-5 3 M100 58 l5 -3 M101 66 h6 M100 74 l5 3" stroke="#F39A5B" strokeWidth="1.6" strokeLinecap="round" />
        </Head>
      );
    case "night_reminder":
      return (
        <Head spec={spec} face="yawn" joints={{ armR: 60, elbR: 110, armsFront: true }}>
          <Bubbles x={24} y={54} />
          <Moon x={96} y={18} r={7} />
        </Head>
      );
    case "owner_changed": {
      // 나는 박수, 새 방장은 열쇠를 든다
      const f = parseAvatar(friend) ?? DEFAULT_AVATAR;
      return (
        <svg className="toast-art wide" viewBox="16 18 152 104" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <Avatar size={120} spec={spec} face="happy" joints={{ armR: -125, armL: 8 }} />
          <g transform="translate(68 0)">
            <Avatar size={120} spec={f} face="proud" joints={{ armL: 8, armR: -8 }} />
          </g>
          <Key x={150} y={34} rot={-45} />
        </svg>
      );
    }
    case "friend_joined": {
      const f = parseAvatar(friend) ?? DEFAULT_AVATAR;
      return (
        <svg className="toast-art wide" viewBox="16 18 152 104" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <Avatar size={120} spec={spec} face="happy" joints={{ armR: -125, armL: 8 }} />
          <g transform="translate(68 0)">
            <Avatar size={120} spec={f} face="happy" joints={{ armL: 125, armR: -8 }} />
          </g>
          <ClapLines x={94} y={62} />
        </svg>
      );
    }
  }
}
