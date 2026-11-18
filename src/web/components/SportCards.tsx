import { Avatar } from "./Avatar";
import type { AvatarSpec } from "../../shared/avatar";
import { SPORTS, SPORT_LABEL, type Sport } from "../../shared/sports";

type Props = { value: Sport | null; avatar: AvatarSpec; onChange: (s: Sport) => void };

export function SportCards({ value, avatar, onChange }: Props) {
  return (
    <div className="choices sport-cards" role="radiogroup" aria-label="운동 종목">
      {SPORTS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          className={`choice sport-card${value === s ? " on" : ""}`}
          onClick={() => onChange(s)}
        >
          <span className="sport-pic" aria-hidden="true">
            <Avatar spec={avatar} size={50} pose={s} />
          </span>
          {SPORT_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
