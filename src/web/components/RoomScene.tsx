import { Avatar } from "./Avatar";
import type { AvatarSpec } from "../../shared/avatar";
import type { Sport } from "../../shared/sports";

type Props = { sport: Sport; lit: boolean; avatar: AvatarSpec };

// 종목별 운동 기구 (viewBox 150x96). 움직이는 부분은 a-* 클래스로 villa.css가 애니메이션한다.
function Equipment({ sport, lit }: { sport: Sport; lit: boolean }) {
  const ink = lit ? "#1B1F27" : "#55607A";
  if (!lit) {
    return (
      <>
        <rect x="14" y="76" width="64" height="14" rx="3" fill="#3A4254" />
        <rect x="14" y="68" width="8" height="22" rx="2" fill="#4A5366" />
      </>
    );
  }
  switch (sport) {
    case "gym":
      return (
        <g className="a-press">
          <line x1="40" y1="34" x2="110" y2="34" stroke={ink} strokeWidth="3" />
          <rect x="32" y="26" width="8" height="16" rx="1" fill={ink} />
          <rect x="110" y="26" width="8" height="16" rx="1" fill={ink} />
        </g>
      );
    case "running":
      return (
        <>
          <rect x="30" y="84" width="90" height="6" rx="3" fill="#4B5563" />
          <line className="belt" x1="36" y1="84" x2="114" y2="84" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="4 4" />
          <line x1="112" y1="84" x2="120" y2="48" stroke="#4B5563" strokeWidth="3" />
          <rect x="112" y="44" width="14" height="6" rx="2" fill="#4B5563" />
        </>
      );
    case "pilates":
      return (
        <>
          <rect x="18" y="86" width="114" height="5" rx="2" fill="#C8B6E2" />
          <g className="a-pil">
            <line className="leg" x1="84" y1="78" x2="116" y2="78" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          </g>
        </>
      );
    case "climbing":
      return (
        <>
          <rect x="22" y="6" width="106" height="86" fill="#E9E2D4" />
          {(
            [
              [36, 18, "#E4572E"],
              [110, 26, "#2A9D8F"],
              [30, 46, "#F4A261"],
              [116, 58, "#9B5DE5"],
              [36, 74, "#2F5BEA"],
            ] as const
          ).map(([x, y, c]) => (
            <circle key={x + "-" + y} cx={x} cy={y} r="4" fill={c} />
          ))}
          <rect x="18" y="88" width="114" height="4" rx="2" fill="#5B6B8C" />
        </>
      );
    case "jiujitsu":
      return (
        <>
          <rect x="10" y="86" width="130" height="6" rx="2" fill="#7FA7C9" />
          <rect x="112" y="48" width="14" height="38" rx="6" fill="#A68A64" />
          <circle cx="119" cy="42" r="7" fill="#A68A64" />
        </>
      );
  }
}

export function RoomScene({ sport, lit, avatar }: Props) {
  return (
    <div className={`scene s-${sport}`}>
      <svg className="scene-bg" viewBox="0 0 150 96" aria-hidden="true" preserveAspectRatio="xMidYMax meet">
        {lit ? (
          <circle cx="75" cy="4" r="4" fill="#FFD25A" />
        ) : (
          <circle cx="75" cy="4" r="3" fill="#3A4254" />
        )}
        <rect x="120" y="8" width="24" height="18" rx="2" fill={lit ? "#DCEBFF" : "#1E2330"} stroke={lit ? "#C9D6EA" : "#3A4254"} />
        <line x1="0" y1="92" x2="150" y2="92" stroke={lit ? "#E7D9A8" : "#3A4254"} strokeWidth="2" />
        <Equipment sport={sport} lit={lit} />
      </svg>
      <div className="figpos">
        <div className="fig">
          <Avatar spec={avatar} size={40} pose={lit ? "idle" : "sleep"} />
        </div>
      </div>
    </div>
  );
}
