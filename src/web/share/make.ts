import { kstDay } from "../../shared/rules/day";
import { loadCertCardData, type CertCardData } from "./data";
import { renderCertCard, renderRoomCard, renderVillaCard, type CertRender, type RoomCardInput, type VillaCardInput } from "./render";
import { shareFileName, type ShareKind } from "./filename";

/** 무엇을 이미지로 만들지 (ShareButton 이 넘긴다) */
export type ShareCard =
  | { kind: "cert"; villaId: string | null }
  | { kind: "room"; input: RoomCardInput }
  | { kind: "villa"; input: VillaCardInput };

export type ShareOptions = { /** 내 인증 사진 넣기 (인증 카드만, 처음에는 꺼짐) */ photo: boolean };
export type ShareImage = { blob: Blob; filename: string; photoMissing: boolean; hasPhotoOption: boolean };

type Deps = {
  loadCert: (villaId: string | null) => Promise<CertCardData>;
  renderCert: (d: CertCardData, withPhoto: boolean) => Promise<CertRender>;
  renderRoom: (i: RoomCardInput) => Promise<Blob>;
  renderVilla: (i: VillaCardInput) => Promise<Blob>;
  now: () => number;
};
const DEFAULT_DEPS: Deps = { loadCert: loadCertCardData, renderCert: renderCertCard, renderRoom: renderRoomCard, renderVilla: renderVillaCard, now: Date.now };

/**
 * 이미지 만들기 함수. 인증 카드 자료는 한 번만 받고(사진 켜고 끄기는 다시 그리기만), 실패하면 다음에 다시 받는다.
 * 사진은 photo 를 켰을 때만 renderCert 가 받는다 (내 게시판에서 고른 내 사진 주소)
 */
export function createMaker(card: ShareCard, deps: Partial<Deps> = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  let cert: Promise<CertCardData> | null = null;
  const name = (kind: ShareKind, blob: Blob) => shareFileName(kind, kstDay(d.now()), blob.type);
  return async (opts: ShareOptions): Promise<ShareImage> => {
    if (card.kind === "cert") {
      cert ??= d.loadCert(card.villaId);
      let data: CertCardData;
      try {
        data = await cert;
      } catch (e) {
        cert = null;
        throw e;
      }
      const r = await d.renderCert(data, opts.photo);
      return { blob: r.blob, filename: name("cert", r.blob), photoMissing: r.photoMissing, hasPhotoOption: true };
    }
    const blob = card.kind === "room" ? await d.renderRoom(card.input) : await d.renderVilla(card.input);
    return { blob, filename: name(card.kind, blob), photoMissing: false, hasPhotoOption: false };
  };
}
