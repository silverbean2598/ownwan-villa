import { AVATAR_OPTIONS, DEFAULT_AVATAR, parseAvatar, type AvatarSpec } from "../../shared/avatar";
import { Arm, Barbell, Dummy, FaceFeatures, HairBack, HairFront, Head, Joint, Leg, PIVOT, Torso, INK } from "./avatar/parts";
import { POSES, type Pose } from "./avatar/poses";
import "./avatar/avatar.css";

export { POSES, type Pose };

type Props = { spec: AvatarSpec; size: number; pose?: Pose; className?: string };

// 서 있는 자세 viewBox (가로:세로 = 1:1.4). 누운 자세는 가로로 돌려 같은 비율의 가로형.
// viewBox 원점은 항상 0 0: transform-box view-box의 기준점이 엔진(WebKit · Gecko)마다 viewBox x,y를
// 따라가므로, 원점을 0으로 두고 리그 위치는 안쪽 그룹의 transform으로 옮긴다.
const STAND_BOX = "0 0 120 168";
const LYING_BOX = "0 0 168 120";
// 바벨 높이 = 자세표 gym의 손 위치 (어깨 y89, 팔꿈치 10, 아래팔 26, 위팔 100°)
const BAR_Y = 61.3;
// 주짓수 가드에서 더미 허리 위치 · 기울기 (누운 viewBox 좌표)
const DUMMY_AT = "translate(122 74) rotate(-30) scale(1.35)";

/**
 * 컷아웃 리그 캐릭터. 머리 · 몸통 · 팔(위팔+아래팔) · 다리가 각자 관절 축을 가진 그룹이고,
 * 자세는 POSES의 관절 각도로만 정한다. 움직임은 avatar.css가 관절 그룹에 건다.
 */
export function Avatar({ spec, size, pose = "idle", className }: Props) {
  const s = parseAvatar(spec) ?? DEFAULT_AVATAR;
  const skin = AVATAR_OPTIONS.skin[s.skin];
  const shirt = AVATAR_OPTIONS.shirt[s.shirt];
  const p = POSES[pose];
  const uniform = p.uniform ?? "tee";
  const lying = !!p.lying;

  const arms = (
    <>
      <Arm side="L" a={p.armL} elb={p.elbL} fore={p.fore} skin={skin} shirt={shirt} uniform={uniform} />
      <Arm side="R" a={p.armR} elb={p.elbR} fore={p.fore} skin={skin} shirt={shirt} uniform={uniform} />
    </>
  );

  return (
    <svg
      className={`av pose-${pose}${className ? ` ${className}` : ""}`}
      data-hair={s.hair}
      role="img"
      aria-label="캐릭터"
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
            {!p.armsFront && arms}
            <Joint part="head" at={PIVOT.neck} a={p.headTilt}>
              <Head skin={skin} />
              <FaceFeatures face={p.face} />
              <HairFront hair={s.hair} />
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
