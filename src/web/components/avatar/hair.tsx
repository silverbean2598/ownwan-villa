import { HAIR, HAIR_HI, INK, line, shade } from "./ink";
import { BANGS, HairBack as BaseHairBack, HairFront as BaseHairFront, Highlights, SOFT_CAP } from "./parts";

// 꾸미기 확장 머리 6종 (docs/art-reference/hair-outfits-accessories.webp 1줄).
// 1차 머리 4종(short · long · bun · buzz)은 parts.tsx 그대로 쓴다. 좌표는 머리 그룹(목 축 60,84) 기준.

/** 머리 둘레를 따라 몽글몽글한 곱슬 외곽선을 만든다 (점들 사이를 바깥으로 부풀린 곡선) */
function curls(pts: [number, number][], bump: number, center: [number, number], closed = false): string {
  const list = closed ? [...pts, pts[0]] : pts;
  let d = `M${list[0][0]} ${list[0][1]}`;
  for (let i = 1; i < list.length; i++) {
    const [x0, y0] = list[i - 1];
    const [x1, y1] = list[i];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const dx = mx - center[0];
    const dy = my - center[1];
    const len = Math.hypot(dx, dy) || 1;
    d += ` Q${(mx + (dx / len) * bump * 2).toFixed(1)} ${(my + (dy / len) * bump * 2).toFixed(1)} ${x1} ${y1}`;
  }
  return closed ? `${d} Z` : d;
}

const ring = (cx: number, cy: number, rx: number, ry: number, n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [+(cx + rx * Math.cos(t)).toFixed(1), +(cy + ry * Math.sin(t)).toFixed(1)];
  });

// 아프로: 머리 뒤 큰 곱슬 구름 + 이마 위 곱슬 앞머리 (아래쪽으로 부푼 곡선)
const AFRO_CLOUD = curls(ring(60, 45, 37.5, 32.5, 26), 1.8, [60, 46], true);
const AFRO_FRINGE_PTS: [number, number][] = [
  [90.5, 64], [88.5, 55.5], [83.5, 50], [77, 47.5], [70, 48.5], [63.5, 46.5], [56.5, 48.5], [50, 46.5], [43.5, 48.5], [37, 50.5], [32, 56], [29.5, 64],
];
const AFRO_FRINGE_EDGE = curls(AFRO_FRINGE_PTS, 1.5, [60, 30]);
const AFRO_CURLS: [number, number][] = [
  [40, 26], [52, 20], [66, 19], [79, 24], [88, 33], [32, 35], [93, 46], [27, 49], [47, 34], [73, 32], [60, 30], [85, 42],
];

// 양갈래: 귀 아래에서 바깥으로 뻗은 머리 다발 (왼쪽, 오른쪽은 좌우 대칭)
const PIGTAIL = "M30 72 C22 70 14 75 12.5 83 C11.5 89 14 94 18 95.5 C17.6 92 18.6 89.6 20.6 88.4 C20.4 92 22 94.6 24.6 95.4 C25 88.6 28.4 81 33 76.5 Z";
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${+(120 - +x).toFixed(2)} ${y}`);

// 포니테일: 정수리 오른쪽 뒤에서 위로 솟았다가 오른쪽으로 물결치며 떨어진다 (머리 뒤에 그림)
const PONYTAIL =
  "M79 31 C83 19 94 14 101.5 20 C106 24 105.5 31 102.5 37 C99.5 43 101 49 104 55 C107 62 104.5 70 99 74 C96 76 92.5 76 90.5 73.5 " +
  "C94 71 96.5 67 95.5 62 C94.5 57 91.5 53 91 47 C90.5 41 92.5 36 88 33 Z";

// 울프컷: 들쭉날쭉한 뚜껑 + 목덜미 바깥으로 뻗친 옆머리(머리 뒤)
const WOLF_TOP =
  "M29 70 C25 66 23.5 59 25.5 53 C22.5 50.5 21 46 23.5 42 C23 33.5 29.5 26 38 24 C40 19 46 16.5 52 18 " +
  "C56 14.5 64 14.5 69.5 17.5 C75 15.5 81.5 18 84.5 23 C90.5 25 94.5 31 94.5 37.5 C98 41.5 98 47.5 95 51 C96.5 58 95 65 91 70 C90 66 89 62 88 58 " +
  "C86.5 53 84 51 81.5 56.5 C80.5 51 78 49 76 48.5 C75 53 72 56 69 59 C68 53 66 50 64 48 C63 52 60 55 56.5 58.5 " +
  "C56 52 54 49 52 48 C51 52 48 55 44.5 57.5 C44 52.5 43 50 41 49 C40 54 37 57 35 61 C33 63 31 66 29 70 Z";
const WOLF_BACK =
  "M29 52 C25 60 24 70 21 81 C23.6 79.2 25.8 79 27.4 80 L26.2 86.4 C29.4 83 32 82 34.6 82.4 L36 78 L84 78 L85.4 82.4 " +
  "C88 82 90.6 83 93.8 86.4 L92.6 80 C94.2 79 96.4 79.2 99 81 C96 70 95 60 91 52 Z";

// 비니 아래로 보이는 짧은 머리(옆머리 + 앞머리)
const BEANIE_HAIR = "M29 68 C25.5 62 26 55 28 49 L92 49 C94 55 94.5 62 91 68 C90 64 89 61 88 58 " + BANGS + " C33 63 31 66 29 68 Z";

/** 머리 뒤(몸통 뒤)에 그리는 머리 */
export function HairBack({ hair }: { hair: string }) {
  switch (hair) {
    case "afro":
      return (
        <g data-part="afro">
          <path d={AFRO_CLOUD} fill={HAIR} {...line} />
          <Curls />
        </g>
      );
    case "pigtails":
      return (
        <g data-part="pigtails">
          {[PIGTAIL, mirror(PIGTAIL)].map((d) => (
            <path key={d} d={d} fill={HAIR} {...line} />
          ))}
          <path d="M16 82 C17 79 19.5 77 22.5 76.5 M104 82 C103 79 100.5 77 97.5 76.5" fill="none" stroke={HAIR_HI} strokeWidth={1.4} strokeLinecap="round" />
        </g>
      );
    case "ponytail":
      return (
        <g data-part="ponytail">
          <path d={PONYTAIL} fill={HAIR} {...line} />
          <path d="M92 22 C98 21 102 25 101 31 M99 46 C101 52 102.5 58 100.5 65" fill="none" stroke={HAIR_HI} strokeWidth={1.4} strokeLinecap="round" />
        </g>
      );
    case "wolf":
      return <path data-part="wolf-back" d={WOLF_BACK} fill={HAIR} {...line} />;
    default:
      return <BaseHairBack hair={hair} />;
  }
}

function Curls() {
  return (
    <g fill="none" stroke={HAIR_HI} strokeWidth={1.3} strokeLinecap="round" opacity="0.9">
      {AFRO_CURLS.map(([x, y]) => (
        <path key={`${x},${y}`} d={`M${x - 2.4} ${y + 0.8} Q${x} ${y - 2.6} ${x + 2.4} ${y + 0.8}`} />
      ))}
    </g>
  );
}

/** 머리띠 (양갈래 · 포니테일) */
function Scrunchie({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g data-part="scrunchie">
      <ellipse cx={cx} cy={cy} rx="3.6" ry="3" fill={color} {...line} strokeWidth={1.1} />
      <path d={`M${cx - 1.6} ${cy - 2.4} Q${cx - 0.6} ${cy} ${cx - 1.6} ${cy + 2.4} M${cx + 1.4} ${cy - 2.5} Q${cx + 2.3} ${cy} ${cx + 1.4} ${cy + 2.5}`} fill="none" stroke={shade(color, -0.25)} strokeWidth={0.8} />
    </g>
  );
}

/** 얼굴 앞(머리 위)에 그리는 머리. shirt = 옷 색 (비니 · 머리끈 색) */
export function HairFront({ hair, shirt }: { hair: string; shirt: string }) {
  switch (hair) {
    case "side-part":
      // 왼쪽 가르마에서 오른쪽으로 크게 넘겨 물결치는 앞머리
      return (
        <g>
          <path
            d={
              "M31 67 C26 61 25 52 27 44 C28.5 31 39 22 52 20.5 C58 19.8 64 19.6 70 20.6 C76 18.8 84 20.5 88 25.5 C93 31 94 38 93 44 C94 52 92.6 60 89.6 67 " +
              "C89 63 88.5 60.5 87 58 C86 53.5 82.5 50.5 77.5 50.2 C72 49.8 66 52.4 60 52.2 C55.5 52 52.5 50 50.5 47.6 " +
              "C49.8 51.5 47.4 54 44.6 55.2 C44.4 52.6 43.4 51 41.6 50.4 C40.6 54.4 37.6 57.4 35 60 C33.6 62.4 32.4 65 31 67 Z"
            }
            fill={HAIR}
            {...line}
          />
          <path d="M50.5 47.6 C48 40 48 31 51.5 23" fill="none" {...line} strokeWidth={1.3} />
          <path d="M53 42 C60 33 74 31 84 40 M57 48 C65 41 76 41 84.5 49 M86.6 57.4 C89 54 88 50 85 49.6" fill="none" {...line} strokeWidth={1.1} opacity="0.7" />
          <Highlights spots={[[39, 32, 4.5, 2.8, -25], [70, 27, 5, 2.6, 12], [87, 36, 2.2, 1.8, 0]]} />
        </g>
      );
    case "afro":
      return (
        <g>
          <path d={`M29.5 64 C28.5 40 42 25 60 25 C78 25 91.5 40 90.5 64 ${AFRO_FRINGE_EDGE.replace(/^M\S+ \S+/, "")} Z`} fill={HAIR} />
          <path d={AFRO_FRINGE_EDGE} fill="none" {...line} />
          <g fill="none" stroke={HAIR_HI} strokeWidth={1.3} strokeLinecap="round">
            {[[44, 38], [58, 34], [72, 37], [36, 45], [83, 44], [51, 42], [66, 42]].map(([x, y]) => (
              <path key={`${x},${y}`} d={`M${x - 2.4} ${y + 0.8} Q${x} ${y - 2.6} ${x + 2.4} ${y + 0.8}`} />
            ))}
          </g>
        </g>
      );
    case "pigtails":
      return (
        <g>
          <path d={SOFT_CAP} fill={HAIR} {...line} />
          <path d="M60 30 C58 36 58 42 59 47 M72 31 C74 36 74 41 72 46 M47 32 C46 37 45 42 46 46" fill="none" {...line} strokeWidth={1} opacity="0.5" />
          <Highlights spots={[[40, 37, 5, 3, -25], [73, 32, 4, 2.4, 20]]} />
          <Scrunchie cx={30.5} cy={74} color={shirt} />
          <Scrunchie cx={89.5} cy={74} color={shirt} />
        </g>
      );
    case "ponytail":
      return (
        <g>
          <path d={SOFT_CAP} fill={HAIR} {...line} />
          <path d="M60 30 C58 36 58 42 59 47 M72 31 C74 36 74 41 72 46 M47 32 C46 37 45 42 46 46" fill="none" {...line} strokeWidth={1} opacity="0.5" />
          <Highlights spots={[[40, 37, 5, 3, -25], [70, 31, 4, 2.4, 20]]} />
          <Scrunchie cx={82} cy={29} color={shirt} />
        </g>
      );
    case "wolf":
      return (
        <g>
          <path d={WOLF_TOP} fill={HAIR} {...line} />
          <path d="M58 24 C56 32 56 40 57 47 M71 25 C74 32 74.5 39 72.5 46 M45 28 C43.5 34 43 40 44 45 M84 32 C86 37 86.5 43 85 48" fill="none" {...line} strokeWidth={1} opacity="0.5" />
          <Highlights spots={[[39, 31, 5, 3, -25], [69, 24, 4.2, 2.4, 15], [85, 35, 2.2, 1.8, 0]]} />
        </g>
      );
    case "beanie": {
      // 짧은 머리 위 니트 비니. 색은 옷 색을 따른다
      const cuff = shade(shirt, -0.1);
      return (
        <g>
          <path d={BEANIE_HAIR} fill={HAIR} {...line} />
          <g data-part="beanie">
            <path d="M27.5 46 C26.5 27 41.5 14.5 60 14.5 C78.5 14.5 93.5 27 92.5 46 Z" fill={shirt} {...line} />
            <path d="M44 20.5 C41 28 40 36 40.6 44 M60 15 V44 M76 20.5 C79 28 80 36 79.4 44" fill="none" stroke={INK} strokeWidth={0.9} opacity="0.28" />
            <path d="M25 51 C24.6 45.6 25.4 42.6 27.6 41.4 C44 37 76 37 92.4 41.4 C94.6 42.6 95.4 45.6 95 51 C78 55 42 55 25 51 Z" fill={cuff} {...line} />
            <g stroke={INK} strokeWidth={0.9} opacity="0.3" strokeLinecap="round">
              {Array.from({ length: 13 }, (_, i) => 30 + i * 5).map((x) => (
                <line key={x} x1={x} y1={40.6 + Math.abs(x - 60) * 0.03} x2={x} y2={52.2 - Math.abs(x - 60) * 0.02} />
              ))}
            </g>
            <path d="M68 20 C76 22.5 83 28 86 35" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity="0.45" />
          </g>
        </g>
      );
    }
    default:
      return <BaseHairFront hair={hair} />;
  }
}
