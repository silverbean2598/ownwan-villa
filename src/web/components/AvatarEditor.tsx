import { Avatar } from "./Avatar";
import { AVATAR_OPTIONS, type AvatarSpec } from "../../shared/avatar";

const HAIR_LABEL: Record<string, string> = { short: "짧은 머리", long: "긴 머리", bun: "올림머리", buzz: "삭발" };

type Props = { value: AvatarSpec; onChange: (a: AvatarSpec) => void };

export function AvatarEditor({ value: avatar, onChange: setAvatar }: Props) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
        <Avatar spec={avatar} size={120} />
      </div>
      <div className="field">
        <label>피부색</label>
        <div className="row swatches">
          {AVATAR_OPTIONS.skin.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`swatch${avatar.skin === i ? " on" : ""}`}
              style={{ background: c }}
              aria-label={`피부색 ${i + 1}`}
              aria-pressed={avatar.skin === i}
              onClick={() => setAvatar({ ...avatar, skin: i })}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label>머리 모양</label>
        <div className="row">
          {AVATAR_OPTIONS.hair.map((h) => (
            <button
              key={h}
              type="button"
              className={`choice small${avatar.hair === h ? " on" : ""}`}
              aria-pressed={avatar.hair === h}
              onClick={() => setAvatar({ ...avatar, hair: h })}
            >
              {HAIR_LABEL[h]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>옷 색</label>
        <div className="row swatches">
          {AVATAR_OPTIONS.shirt.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`swatch${avatar.shirt === i ? " on" : ""}`}
              style={{ background: c }}
              aria-label={`옷 색 ${i + 1}`}
              aria-pressed={avatar.shirt === i}
              onClick={() => setAvatar({ ...avatar, shirt: i })}
            />
          ))}
        </div>
      </div>
    </>
  );
}
