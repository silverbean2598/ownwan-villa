import { AVATAR_OPTIONS, DEFAULT_AVATAR, parseAvatar, type AvatarSpec } from "../../shared/avatar";
import { Arm, Barbell, Dummy, FaceFeatures, FaceOverHair, Head, Joint, Leg, PIVOT, Torso, INK, type Uniform } from "./avatar/parts";
import { HairBack, HairFront } from "./avatar/hair";
import { Earphones, Glasses, Headwear, Towel, isOutfit } from "./avatar/wear";
import { POSES, type Face, type Pose, type PoseDef } from "./avatar/poses";
import "./avatar/avatar.css";

export { POSES, type Face, type Pose, type PoseDef };

type Props = {
  spec: AvatarSpec;
  size: number;
  pose?: Pose;
  className?: string;
  /** 자세의 표정 대신 쓸 표정 (축하 · 알림 화면) */
  face?: Face;
  /** 자세의 관절 각도 일부를 바꾼다 (축하 장면: 트로피 들기, 점프 등). 서 있는 자세에만 쓴다 */
  joints?: Partial<Pick<PoseDef, "armL" | "armR" | "elbL" | "elbR" | "legL" | "legR" | "headTilt" | "offsetY" | "fore" | "armsFront">>;
  /** 접근성 이름 (기본 "캐릭터") */
  label?: string;
};

// 서 있는 자세 viewBox (가로:세로 = 1:1.4). 누운 자세는 가로로 돌려 같은 비율의 가로형.
// viewBox 원점은 항상 0 0: transform-box view-box의 기준점이 엔진(WebKit · Gecko)마다 viewBox x,y를
// 따라가므로, 원점을 0으로 두고 리그 위치는 안쪽 그룹의 transform으로 옮긴다.
const STAND_BOX = "0 0 120 168";
const LYING_BOX = "0 0 168 120";
// 바벨 높이 = 자세표 gym의 손 위치 (어깨 y89, 팔꿈치 10, 아래팔 26, 위팔 100°)
const BAR_Y = 61.3;
// 주짓수 가드에서 더미 허리 위치 · 기울기 (누운 viewBox 좌표). 리그(poses.ts jiujitsu의 translate x)와 함께 옮긴다
const DUMMY_AT = "translate(127 74) rotate(-30) scale(1.35)";

/**
 * 컷아웃 리그 캐릭터. 머리 · 몸통 · 팔(위팔+아래팔) · 다리가 각자 관절 축을 가진 그룹이고,
 * 자세는 POSES의 관절 각도로만 정한다. 움직임은 avatar.css가 관절 그룹에 건다.
 */
export function Avatar({ spec, size, pose = "idle", className, face, joints, label = "캐릭터" }: Props) {
  const s = parseAvatar(spec) ?? DEFAULT_AVATAR;
  const skin = AVATAR_OPTIONS.skin[s.skin];
  const shirt = AVATAR_OPTIONS.shirt[s.shirt];
  const p: PoseDef = { ...POSES[pose], ...joints, ...(face ? { face } : {}) };
  // 주짓수 · 태권도 자세는 산 옷 대신 도복을 입는다
  const uniform: Uniform = p.uniform ?? (isOutfit(s.outfit) ? s.outfit : "tee");
  const lying = !!p.lying;
  const acc = new Set(s.acc ?? []);
  // 비니는 머리 자리를 차지하므로 모자 · 헤어밴드를 숨긴다. 선글라스 표정엔 안경을 숨긴다
  const headAcc = s.hair === "beanie" ? null : (s.acc ?? []).find((a) => a === "cap" || a === "headband");
  const glasses = acc.has("glasses") && p.face !== "cool";
  const wristband = acc.has("wristbands");

  const arms = (
    <>
      <Arm side="L" a={p.armL} elb={p.elbL} fore={p.fore} skin={skin} shirt={shirt} uniform={uniform} wristband={wristband} />
      <Arm side="R" a={p.armR} elb={p.elbR} fore={p.fore} skin={skin} shirt={shirt} uniform={uniform} wristband={wristband} />
    </>
  );

  return (
    <svg
      className={`av pose-${pose}${className ? ` ${className}` : ""}`}
      data-hair={s.hair}
      data-outfit={uniform}
      role="img"
      aria-label={label}
      width={lying ? size * 1.4 : size}
      height={lying ? size : size * 1.4}
      viewBox={lying ? LYING_BOX : STAND_BOX}
      xmlns="http://www.w3.org/2000/svg"
    >
      {p.dummy && <Dummy transform={DUMMY_AT} />}
      <g transform={p.lying ?? `translate(0 ${p.offsetY})`}>
        <g data-part="body">
          <Leg side="L" a={p.legL} skin={skin} uniform={uniform} />
          <Leg side="R" a={p.legR} skin={skin} uniform={uniform} />
          <Joint part="upper" at={PIVOT.hip} a={p.torso}>
            <Joint part="hairBack" at={PIVOT.neck} a={p.headTilt}>
              <HairBack hair={s.hair} />
            </Joint>
            <Torso skin={skin} shirt={shirt} uniform={uniform} />
            {acc.has("earphones") && <Earphones />}
            {!p.armsFront && arms}
            {acc.has("towel") && <Towel />}
            <Joint part="head" at={PIVOT.neck} a={p.headTilt}>
              <Head skin={skin} />
              <FaceFeatures face={p.face} skin={skin} />
              <HairFront hair={s.hair} shirt={shirt} />
              {headAcc && <Headwear id={headAcc} />}
              <FaceOverHair face={p.face} />
              {glasses && <Glasses />}
            </Joint>
            {pose === "gym" && <Barbell y={BAR_Y} />}
            {p.armsFront && arms}
          </Joint>
        </g>
      </g>
      {p.face === "sleep" && (
        <g fill="#8C93B8" stroke={INK} strokeWidth="0.4" fontWeight="800" fontFamily="sans-serif">
          <text className="z1" x="92" y="30" fontSize="14">z</text>
          <text className="z2" x="103" y="18" fontSize="10">z</text>
        </g>
      )}
    </svg>
  );
}
