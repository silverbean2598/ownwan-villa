import { AVATAR_OPTIONS, DEFAULT_AVATAR, parseAvatar, type AvatarSpec } from "../../shared/avatar";

type Props = { spec: AvatarSpec; size: number; pose?: "idle" | "sleep"; className?: string };

const HAIR = "#4A3B32";
const LEG = "#5C6770";

export function Avatar({ spec, size, pose = "idle", className }: Props) {
  const s = parseAvatar(spec) ?? DEFAULT_AVATAR;
  const skin = AVATAR_OPTIONS.skin[s.skin];
  const shirt = AVATAR_OPTIONS.shirt[s.shirt];
  const sleep = pose === "sleep";
  return (
    <svg
      className={className}
      role="img"
      aria-label="캐릭터"
      width={size}
      height={size * 1.4}
      viewBox="0 0 100 140"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 다리 */}
      <g stroke={LEG} strokeWidth="9" strokeLinecap="round">
        <line x1="40" y1="96" x2="38" y2="126" />
        <line x1="60" y1="96" x2="62" y2="126" />
      </g>
      {/* 팔 */}
      <g stroke={skin} strokeWidth="8" strokeLinecap="round">
        <line x1="29" y1="68" x2="24" y2="92" />
        <line x1="71" y1="68" x2="76" y2="92" />
      </g>
      {/* 몸통 */}
      <rect x="28" y="58" width="44" height="44" rx="16" fill={shirt} />
      {/* 뒤쪽 머리카락 */}
      {s.hair === "long" && <rect x="26" y="20" width="48" height="52" rx="22" fill={HAIR} />}
      {s.hair === "bun" && <circle cx="50" cy="8" r="9" fill={HAIR} />}
      {/* 머리 */}
      <circle cx="50" cy="36" r="22" fill={skin} />
      {/* 앞쪽 머리카락 */}
      {s.hair === "short" && <path d="M28 36 A22 22 0 0 1 72 36 Q60 24 50 28 Q38 24 28 36 Z" fill={HAIR} />}
      {s.hair === "long" && <path d="M28 38 A22 22 0 0 1 72 38 Q58 22 50 26 Q40 22 28 38 Z" fill={HAIR} />}
      {s.hair === "bun" && <path d="M28 36 A22 22 0 0 1 72 36 Q60 26 50 28 Q40 26 28 36 Z" fill={HAIR} />}
      {s.hair === "buzz" && <path d="M29 33 A22 22 0 0 1 71 33 Q50 24 29 33 Z" fill={HAIR} opacity="0.55" />}
      {/* 눈 */}
      {sleep ? (
        <g stroke="#3A3A3A" strokeWidth="2.5" strokeLinecap="round">
          <line x1="39" y1="40" x2="45" y2="40" />
          <line x1="55" y1="40" x2="61" y2="40" />
        </g>
      ) : (
        <g fill="#3A3A3A">
          <circle cx="42" cy="40" r="2.6" />
          <circle cx="58" cy="40" r="2.6" />
        </g>
      )}
      {/* 입 */}
      <path d="M45 48 Q50 52 55 48" stroke="#3A3A3A" strokeWidth="2" fill="none" strokeLinecap="round" />
      {sleep && (
        <text x="78" y="22" fontSize="16" fontWeight="700" fill="#9AA5B1">
          z
        </text>
      )}
    </svg>
  );
}
