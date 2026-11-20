import { Link } from "react-router-dom";
import { SpriteAvatar } from "./avatar2/SpriteAvatar";
import { WearPreview } from "./WearPreview";
import { AVATAR_OPTIONS, type AvatarSpec } from "../../shared/avatar";
import { ACCESSORIES, ACC_SLOTS, OUTFITS, findAccessory, type AccSlot } from "../../shared/catalog";

export const HAIR_LABEL: Record<string, string> = {
  short: "짧은 머리",
  long: "긴 머리",
  bun: "올림머리",
  buzz: "삭발",
  "side-part": "가르마",
  afro: "곱슬 아프로",
  pigtails: "양갈래",
  ponytail: "포니테일",
  wolf: "울프컷",
  beanie: "비니",
};

const SLOT_LABEL: Record<AccSlot, string> = { head: "머리", face: "얼굴", neck: "목", shoulder: "어깨", wrist: "손목" };

/** 소품을 끼거나 뺀다. 같은 몸 자리에 있던 소품은 빠진다 */
export function toggleAcc(spec: AvatarSpec, id: string): AvatarSpec {
  const cur = spec.acc ?? [];
  const slot = findAccessory(id)?.accSlot;
  const acc = cur.includes(id) ? cur.filter((a) => a !== id) : [...cur.filter((a) => findAccessory(a)?.accSlot !== slot), id];
  const { acc: _, ...rest } = spec;
  return acc.length ? { ...rest, acc } : rest;
}

/** 기본 옷(id 없음)으로 돌리거나 산 옷을 입는다 */
function withOutfit(spec: AvatarSpec, outfit: string | undefined): AvatarSpec {
  const { outfit: _, ...rest } = spec;
  return outfit ? { ...rest, outfit } : rest;
}

// 미리 보기 기준 크기: 서 있는 그림 높이 ≈ 155px (그림 원본 400px 보다 작게 그려 흐리지 않다)
const PREVIEW = 120;
const PREVIEW_H = 160;

type Props = { value: AvatarSpec; onChange: (a: AvatarSpec) => void; /** 가진 옷 · 소품 id */ owned?: string[] };

export function AvatarEditor({ value: avatar, onChange: setAvatar, owned = [] }: Props) {
  const ownedAcc = ACCESSORIES.filter((a) => owned.includes(a.id));
  const hiddenHead = avatar.hair === "beanie" && (avatar.acc ?? []).some((a) => findAccessory(a)?.accSlot === "head");
  return (
    <>
      {/* 방에 보이는 새 캐릭터 그대로. 상자 높이를 고정해 머리 · 옷을 바꿔도 아래 고르기 칸이 움직이지 않는다 */}
      <div className="editor-preview" style={{ height: PREVIEW_H }}>
        <SpriteAvatar spec={avatar} size={PREVIEW} pose="idle" label="미리 보기 캐릭터" />
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
        <div className="row wrap">
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
        <label id="shirt-color-label">옷 색</label>
        <div className="row swatches" aria-describedby="shirt-color-note">
          {AVATAR_OPTIONS.shirt.map((c, i) => (
            <button
              key={c}
              type="button"
              disabled
              className={`swatch${avatar.shirt === i ? " on" : ""}`}
              style={{ background: c }}
              aria-label={`옷 색 ${i + 1}`}
              aria-pressed={avatar.shirt === i}
              onClick={() => setAvatar({ ...avatar, shirt: i })}
            />
          ))}
        </div>
        {/* 새 캐릭터 티셔츠 색 그림이 아직 없다 (layers.ts SHIRT_ASSET). 그림이 들어오면 disabled · 안내를 뺀다 */}
        <p id="shirt-color-note" className="muted wear-empty">새 캐릭터 옷 색은 곧 추가돼요.</p>
      </div>
      <div className="field">
        <label>옷</label>
        <ul className="wear-grid">
          <li>
            <button type="button" className={`wear${!avatar.outfit ? " on" : ""}`} aria-pressed={!avatar.outfit} onClick={() => setAvatar(withOutfit(avatar, undefined))}>
              <WearPreview spec={withOutfit(avatar, undefined)} itemId="" size={72} />
              <span>기본 티셔츠</span>
            </button>
          </li>
          {OUTFITS.map((o) =>
            owned.includes(o.id) ? (
              <li key={o.id}>
                <button type="button" className={`wear${avatar.outfit === o.id ? " on" : ""}`} aria-pressed={avatar.outfit === o.id} onClick={() => setAvatar(withOutfit(avatar, o.id))}>
                  <WearPreview spec={avatar} itemId={o.id} size={72} />
                  <span>{o.name}</span>
                </button>
              </li>
            ) : (
              <li key={o.id}>
                <Link className="wear locked" to="/shop?tab=outfit" aria-label={`${o.name}: ${o.price}P, 상점에서 사기`}>
                  <WearPreview spec={avatar} itemId={o.id} size={72} />
                  <span>{o.name}</span>
                  <small>🔒 {o.price}P · 상점</small>
                </Link>
              </li>
            ),
          )}
        </ul>
      </div>
      <div className="field">
        <label>소품</label>
        {ownedAcc.length === 0 ? (
          <p className="muted wear-empty">
            아직 산 소품이 없어요. <Link to="/shop?tab=accessory">상점</Link>에서 모자 · 안경 · 수건 같은 소품을 골라 보세요.
          </p>
        ) : (
          <div className="acc-slots">
            {ACC_SLOTS.filter((slot) => ownedAcc.some((a) => a.accSlot === slot)).map((slot) => (
              <div key={slot} className="row acc-row" role="group" aria-label={`${SLOT_LABEL[slot]} 소품`}>
                <span className="acc-slot">{SLOT_LABEL[slot]}</span>
                {ownedAcc
                  .filter((a) => a.accSlot === slot)
                  .map((a) => {
                    const on = (avatar.acc ?? []).includes(a.id);
                    return (
                      <button key={a.id} type="button" className={`choice small${on ? " on" : ""}`} aria-pressed={on} onClick={() => setAvatar(toggleAcc(avatar, a.id))}>
                        {a.name}
                      </button>
                    );
                  })}
              </div>
            ))}
            {hiddenHead && <p className="muted wear-empty">비니를 쓰면 머리 소품은 보이지 않아요.</p>}
            <p className="muted wear-empty">
              다른 소품은 <Link to="/shop?tab=accessory">상점</Link>에서 살 수 있어요.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
