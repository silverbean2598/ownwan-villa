import { createElement } from "react";
import { RoomScene } from "../components/RoomScene";
import { layoutFloors, type Member } from "../components/Building";
import { spriteBox, spriteLayers } from "../components/avatar2/layers";
import type { Pose } from "../components/avatar2/pose";
import { SPORT_LABEL } from "../../shared/sports";
import { VILLA_CAPACITY, kindLabel, type VillaKind } from "../../shared/villa";
import { formatPrice } from "../../shared/rules/price";
import type { AvatarSpec } from "../../shared/avatar";
import { canvasToBlob, fillRound, font, fontsReady, loadImage, makeCanvas, roundRectPath } from "./canvas";
import { SHARE_FRAME, sceneImage } from "./scene";
import { fitText, wrapText } from "./text";
import type { CertCardData } from "./data";

/** 화이트톤 색 (theme.css · villa.css 와 같은 값) */
const C = {
  bg: "#FFFDF8",
  ink: "#1a1a1a",
  muted: "#6B7280",
  line: "#ECECEC",
  lit: "#FFF3CF",
  glow: "#FFE08A",
  gold: "#C9A227",
  accent: "#2F5BEA",
  dark: "#2A3040",
  darkInk: "#8A93A6",
  note: "#FFF5A8",
  brown: "#5B4640",
};

const ICON = "/icon-192.png";

type Ctx = CanvasRenderingContext2D;
const measureOf = (ctx: Ctx) => (s: string) => ctx.measureText(s).width;

/** 사이트 주소 (꼬리말). 예: ownwan-villa.silverbin2598.workers.dev */
export function siteHost(): string {
  try {
    return window.location.host;
  } catch {
    return "";
  }
}

/** "2026-11-20" → "11월 20일 금요일" */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const wd = "일월화수목금토"[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${wd}요일`;
}

/** 내 층 표시: 펜트하우스 · n층 · 빌라 없음("–") */
export const floorText = (floor: number | null, penthouse: boolean) => (penthouse ? "펜트하우스" : floor ? `${floor}층` : "–");

/** 글자를 maxPx 부터 줄여 maxW 안에 넣는다. minPx 에서도 넘치면 … 로 자른다. 쓴 글자 · 크기를 돌려준다 */
function fitFont(ctx: Ctx, text: string, maxW: number, weight: number, maxPx: number, minPx: number) {
  let px = maxPx;
  for (; px > minPx; px -= 2) {
    ctx.font = font(weight, px);
    if (ctx.measureText(text).width <= maxW) return { text, px };
  }
  ctx.font = font(weight, minPx);
  return { text: fitText(text, maxW, measureOf(ctx)), px: minPx };
}

/** 꼬리말: 작은 앱 아이콘 + "오운완빌라" + 사이트 주소 (가운데, 옅게). y = 글자 가운데 줄 */
function drawFooter(ctx: Ctx, W: number, y: number, icon: HTMLImageElement | null, s = 1) {
  const host = siteHost();
  const iz = 40 * s;
  const gap = 12 * s;
  ctx.textBaseline = "middle";
  ctx.font = font(800, 28 * s);
  const brand = "오운완빌라";
  const bw = ctx.measureText(brand).width;
  ctx.font = font(500, 24 * s);
  const hostText = host ? fitText(host, W * 0.6, measureOf(ctx)) : "";
  const hw = hostText ? ctx.measureText(hostText).width + gap * 1.6 : 0;
  const total = (icon ? iz + gap : 0) + bw + hw;
  let x = (W - total) / 2;
  ctx.save();
  ctx.globalAlpha = 0.85;
  if (icon) {
    ctx.save();
    roundRectPath(ctx, x, y - iz / 2, iz, iz, iz * 0.28);
    ctx.clip();
    ctx.drawImage(icon, x, y - iz / 2, iz, iz);
    ctx.restore();
    x += iz + gap;
  }
  ctx.fillStyle = C.ink;
  ctx.font = font(800, 28 * s);
  ctx.textAlign = "left";
  ctx.fillText(brand, x, y);
  x += bw + gap * 1.6;
  if (hostText) {
    ctx.fillStyle = C.muted;
    ctx.font = font(500, 24 * s);
    ctx.fillText(hostText, x, y);
  }
  ctx.restore();
}

/**
 * 캐릭터를 canvas 에 바로 그린다 (그림 띠에서 SHARE_FRAME 번째 칸). 발(아래끝)이 floorY, 가운데가 cx.
 * 크기는 maxW · maxH 안에서 가장 크게. 못 받은 층은 빼고 그린다. 그린 상자를 돌려준다
 */
async function drawCharacter(ctx: Ctx, spec: AvatarSpec, pose: Pose, cx: number, floorY: number, maxW: number, maxH: number) {
  const L = spriteLayers(spec, pose, "full");
  const imgs = await Promise.all(L.urls.map((u) => loadImage(u)));
  const unit = spriteBox(pose, 1);
  const b = spriteBox(pose, Math.min(maxH / unit.h, maxW / unit.w));
  const x = cx - b.w / 2;
  const y = floorY - b.floor;
  // 발밑 그림자
  ctx.save();
  ctx.fillStyle = "rgba(91, 70, 64, 0.13)";
  ctx.beginPath();
  ctx.ellipse(cx, floorY - b.h * 0.01, b.w * 0.34, Math.max(10, b.h * 0.035), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const f = Math.min(SHARE_FRAME, L.meta.frames - 1);
  for (const img of imgs) {
    if (!img) continue;
    const k = img.naturalWidth / L.stripW;
    ctx.drawImage(img, f * L.meta.fw * k, 0, L.meta.fw * k, img.naturalHeight, x, y, b.w, b.h);
  }
  return { x, y, w: b.w, h: b.h };
}

/** 내 인증 사진: 같은 사이트 주소(/api/photos/…)를 로그인한 채로 받아 그림으로. 실패하면 null */
async function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    const obj = URL.createObjectURL(await res.blob());
    const img = await loadImage(obj);
    // 그린 뒤에도 그림은 남아 있으므로 주소는 조금 뒤에 지운다
    setTimeout(() => URL.revokeObjectURL(obj), 30_000);
    return img;
  } catch {
    return null;
  }
}

/** 그림을 상자에 꽉 차게(넘치는 쪽은 가운데를 잘라) 그린다 */
function drawCover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function softGlow(ctx: Ctx, cx: number, cy: number, r: number) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  g.addColorStop(0, "rgba(255, 224, 138, 0.55)");
  g.addColorStop(0.55, "rgba(255, 243, 207, 0.55)");
  g.addColorStop(1, "rgba(255, 253, 248, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

export type CertRender = { blob: Blob; /** 사진을 넣으려 했지만 오늘 사진이 없었다 */ photoMissing: boolean };

/**
 * 오늘 인증 카드 (스토리 크기 1080×1920).
 * withPhoto: "내 인증 사진 넣기". 켰을 때만 오늘 내 사진(d.photoUrl, 내 게시판에서 고른 주소)을 받는다
 */
export async function renderCertCard(d: CertCardData, withPhoto: boolean): Promise<CertRender> {
  const W = 1080;
  const H = 1920;
  await fontsReady();
  const { canvas, ctx } = makeCanvas(W, H);
  const wantPhoto = withPhoto && !!d.photoUrl;
  const [icon, photo] = await Promise.all([loadImage(ICON), wantPhoto ? loadPhoto(d.photoUrl!) : Promise.resolve(null)]);
  const M = 80;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 위: 날짜 · 큰 제목 · 빌라 이름
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.muted;
  ctx.font = font(700, 40);
  ctx.fillText(dayLabel(d.day), W / 2, 170);
  ctx.fillStyle = C.ink;
  const title = fitFont(ctx, "오늘 오운완!", W - 2 * M, 900, 150, 100);
  ctx.font = font(900, title.px);
  ctx.fillText(title.text, W / 2, 320);
  let top = 360;
  if (d.villaName) {
    ctx.fillStyle = C.brown;
    ctx.font = font(700, 44);
    ctx.fillText(fitText(d.villaName, W - 2 * M - 40, measureOf(ctx)), W / 2, 404);
    top = 440;
  }

  // 아래부터 쌓기: 꼬리말 → 루틴 메모 → 기록 카드
  const footerY = H - 92;
  let bottom = footerY - 70;
  if (d.routine) {
    ctx.font = font(600, 40);
    const lines = wrapText(d.routine, W - 2 * M - 120, 3, measureOf(ctx));
    const lh = 56;
    const nh = 52 + 40 + 14 + lines.length * lh + 30;
    const ny = bottom - nh;
    ctx.save();
    ctx.translate(W / 2, ny + nh / 2);
    ctx.rotate((-1.2 * Math.PI) / 180);
    ctx.shadowColor = "rgba(91, 70, 64, 0.16)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    fillRound(ctx, -(W - 2 * M) / 2, -nh / 2, W - 2 * M, nh, 18, C.note);
    ctx.shadowColor = "transparent";
    // 압정
    ctx.fillStyle = "#E86A5A";
    ctx.beginPath();
    ctx.arc(0, -nh / 2 + 4, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#8A6A2A";
    ctx.font = font(800, 32);
    const lx = -(W - 2 * M) / 2 + 60;
    ctx.fillText("오늘 루틴", lx, -nh / 2 + 52 + 30);
    ctx.fillStyle = C.ink;
    ctx.font = font(600, 40);
    lines.forEach((l, i) => ctx.fillText(l, lx, -nh / 2 + 52 + 40 + 14 + lh * (i + 1) - 14));
    ctx.restore();
    bottom = ny - 44;
  }
  const cardH = 196;
  const cardY = bottom - cardH;
  const cards: [string, string][] = [
    ["연속 기록", `${d.streak}일`],
    ["내 층", floorText(d.floor, d.penthouse)],
    ["종목", SPORT_LABEL[d.sport] ?? ""],
  ];
  const gap = 24;
  const cw = (W - 2 * M - gap * 2) / 3;
  cards.forEach(([label, value], i) => {
    const x = M + i * (cw + gap);
    ctx.save();
    ctx.shadowColor = "rgba(26, 26, 26, 0.06)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
    fillRound(ctx, x, cardY, cw, cardH, 36, "#fff");
    ctx.restore();
    roundRectPath(ctx, x + 1.5, cardY + 1.5, cw - 3, cardH - 3, 35);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = C.muted;
    ctx.font = font(700, 32);
    ctx.fillText(label, x + cw / 2, cardY + 66);
    ctx.fillStyle = i === 0 ? "#D9480F" : C.ink;
    const v = fitFont(ctx, value, cw - 36, 800, 74, 40);
    ctx.font = font(800, v.px);
    ctx.fillText(v.text, x + cw / 2, cardY + 152);
  });

  // 가운데: 캐릭터 (사진을 넣으면 둥근 액자 + 오른쪽 아래에 캐릭터)
  const zoneTop = top + 20;
  const zoneBottom = cardY - 36;
  const zoneH = zoneBottom - zoneTop;
  if (photo) {
    const P = Math.min(zoneH - 70, 700);
    const px = (W - P) / 2 - 70;
    const py = zoneTop + (zoneH - P) / 2 - 30;
    softGlow(ctx, W / 2, py + P / 2, P * 0.78);
    ctx.save();
    ctx.translate(px + P / 2, py + P / 2);
    ctx.rotate((-2.5 * Math.PI) / 180);
    ctx.shadowColor = "rgba(26, 26, 26, 0.16)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    fillRound(ctx, -P / 2, -P / 2, P, P, 48, "#fff");
    ctx.shadowColor = "transparent";
    const b = 20;
    ctx.save();
    roundRectPath(ctx, -P / 2 + b, -P / 2 + b, P - 2 * b, P - 2 * b, 32);
    ctx.clip();
    drawCover(ctx, photo, -P / 2 + b, -P / 2 + b, P - 2 * b, P - 2 * b);
    ctx.restore();
    ctx.restore();
    const ch = Math.min(P * 0.66, zoneBottom - zoneTop);
    const cx = Math.min(px + P - 10, W - 60 - ch * 0.35);
    await drawCharacter(ctx, d.avatar, d.sport, cx, py + P + 54, ch * 0.9, ch);
  } else {
    const ch = Math.min(zoneH - 70, 720);
    const floorY = zoneBottom - 30;
    softGlow(ctx, W / 2, floorY - ch * 0.48, Math.min(ch * 0.78, 520));
    await drawCharacter(ctx, d.avatar, d.sport, W / 2, floorY, W - 2 * M, ch);
  }

  drawFooter(ctx, W, footerY, icon);
  return { blob: await canvasToBlob(canvas), photoMissing: withPhoto && !photo };
}

export type RoomCardInput = { member: Member; penthouse: boolean; villaName: string | null };

/** 내 방 (정사각형 1080×1080): 방 상세 그림(불 켜짐 · 꺼짐, 가구, 캐릭터) + 닉네임 · 층 · 빌라 이름 */
export async function renderRoomCard({ member, penthouse, villaName }: RoomCardInput): Promise<Blob> {
  const W = 1080;
  const H = 1080;
  await fontsReady();
  const { canvas, ctx } = makeCanvas(W, H);
  const lit = member.certifiedToday;
  // 방 상세 그림은 300 × 360
  const rh = 740;
  const rw = (rh * 300) / 360;
  const rx = (W - rw) / 2;
  const ry = 236;
  const cache = new Map<string, Promise<string | null>>();
  const [icon, room] = await Promise.all([
    loadImage(ICON),
    sceneImage(
      createElement(RoomScene, { sport: member.sport, lit, avatar: member.avatar, penthouse, variant: "detail", placements: member.placements }),
      rw,
      rh,
      cache,
    ),
  ]);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const M = 80;

  // 오른쪽 위: 오늘 상태
  const status = lit ? "오늘 오운완 완료" : "오늘은 쉬는 중";
  ctx.font = font(800, 30);
  const sw = ctx.measureText(status).width + 52;
  fillRound(ctx, W - M - sw, 78, sw, 60, 30, lit ? C.lit : C.dark);
  ctx.fillStyle = lit ? "#8A5A00" : "#DCE7FF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(status, W - M - sw / 2, 109);

  // 왼쪽 위: 닉네임 · 빌라 이름 · 층
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.ink;
  const nick = fitFont(ctx, `${member.nickname}의 방`, W - 2 * M - sw - 30, 800, 66, 44);
  ctx.font = font(800, nick.px);
  ctx.fillText(nick.text, M, 132);
  ctx.fillStyle = C.muted;
  ctx.font = font(600, 36);
  const sub = [villaName, floorText(member.floor, penthouse), SPORT_LABEL[member.sport]].filter(Boolean).join(" · ");
  ctx.fillText(fitText(sub, W - 2 * M, measureOf(ctx)), M, 192);

  // 방 그림 (뒤에 옅은 빛 · 그림자)
  if (lit) softGlow(ctx, W / 2, ry + rh / 2, rh * 0.62);
  ctx.save();
  ctx.shadowColor = "rgba(26, 26, 26, 0.14)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  fillRound(ctx, rx + 6, ry + 6, rw - 12, rh - 12, 26, lit ? C.lit : C.dark);
  ctx.restore();
  if (room) ctx.drawImage(room, rx, ry, rw, rh);

  drawFooter(ctx, W, H - 46, icon, 0.9);
  return canvasToBlob(canvas);
}

export type VillaCardInput = {
  villa: {
    name: string;
    ownerId: string;
    penthouseUserId: string | null;
    members: Member[];
    kind?: VillaKind;
    capacity?: number;
    price?: number | null;
  };
  meId: string;
};

/**
 * 우리 빌라 전체 (가로 1080, 세로는 층 수만큼): 건물 단면 — 펜트하우스 · 층마다 방(캐릭터 · 닉네임) · 빈방.
 * 빌라 화면에서 입주민이 이미 보는 것만 (사진 · 루틴은 넣지 않는다)
 */
export async function renderVillaCard({ villa, meId }: VillaCardInput): Promise<Blob> {
  const W = 1080;
  const k = 2.6; // 앱 화면 px → 카드 px
  const capacity = villa.capacity ?? VILLA_CAPACITY;
  const rows = layoutFloors(villa.members, villa.penthouseUserId, capacity);
  const X0 = 64;
  const X1 = W - 64;
  const BW = X1 - X0;
  const pad = 6 * k;
  const labelW = 30 * k;
  const tileW = (BW - 2 * pad - labelW - 3 * pad) / 3;
  const sceneH = (tileW * 100) / 150;
  const tagH = 22 * k;
  const tileH = sceneH + tagH;
  const rowH = tileH + 2 * pad;
  const phLabelW = 16 * k;
  const phPad = 8 * k;
  const phTileW = BW - 2 * phPad - phLabelW - phPad;
  const phSceneH = (phTileW * 100) / 240;
  const phRowH = phSceneH + tagH + 4 * k + 2 * phPad;
  const gapH = 28 * k;
  const apt = villa.kind === "apartment";
  const roofH = (apt ? 20 : 10) * k;

  // 1) 배치: 세로 위치를 먼저 정한다
  const headH = 300;
  type Tile = { m: Member; x: number; y: number; w: number; sh: number; ph: boolean };
  type Cell = { kind: "vacant" | "wall"; x: number; y: number };
  type Band = { kind: "ph" | "floor" | "gap" | "more"; y: number; h: number; label?: string };
  const tiles: Tile[] = [];
  const cells: Cell[] = [];
  const bands: Band[] = [];
  let y = headH + roofH;
  for (const r of rows) {
    if ("gap" in r) {
      const [lo, hi] = r.gap;
      bands.push({ kind: "gap", y, h: gapH, label: `${lo === hi ? `${lo}F` : `${lo}–${hi}F`} · 비어 있음` });
      y += gapH;
      continue;
    }
    if (r.floor === "PH") {
      bands.push({ kind: "ph", y, h: phRowH });
      for (const m of r.members) tiles.push({ m, x: X0 + phPad + phLabelW + phPad, y: y + phPad, w: phTileW, sh: phSceneH, ph: true });
      y += phRowH;
      continue;
    }
    // 1층: 빈방을 남은 칸부터 채우고, 넘치면 다음 줄로 (Building 과 같은 규칙)
    const all: (Member | null)[] = [...r.members, ...Array.from({ length: r.emptySlots ?? 0 }, () => null)];
    const chunks: (Member | null)[][] = [];
    for (let i = 0; i < all.length; i += 3) chunks.push(all.slice(i, i + 3));
    if (!chunks.length) chunks.push([]);
    chunks.forEach((c, ci) => {
      bands.push({ kind: "floor", y, h: rowH, label: !r.cont && ci === 0 ? `${r.floor}F` : "" });
      for (let i = 0; i < 3; i++) {
        const x = X0 + pad + labelW + pad + i * (tileW + pad);
        const m = c[i];
        if (m) tiles.push({ m, x, y: y + pad, w: tileW, sh: sceneH, ph: false });
        else cells.push({ kind: i < c.length ? "vacant" : "wall", x, y: y + pad });
      }
      y += rowH;
    });
    if (r.vacantMore) {
      bands.push({ kind: "more", y, h: gapH, label: `빈방 ${r.vacantMore}개` });
      y += gapH;
    }
  }
  const entryY = y;
  const entryH = 44 * k;
  const groundY = entryY + entryH;
  const groundH = 14 * k;
  const H = Math.round(groundY + groundH + 150);

  await fontsReady();
  const { canvas, ctx } = makeCanvas(W, H);
  const cache = new Map<string, Promise<string | null>>();
  const [icon, ...scenes] = await Promise.all([
    loadImage(ICON),
    ...tiles.map((t) =>
      sceneImage(
        createElement(RoomScene, { sport: t.m.sport, lit: t.m.certifiedToday, avatar: t.m.avatar, penthouse: t.ph, placements: t.m.placements }),
        t.w,
        t.sh,
        cache,
      ),
    ),
  ]);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 머리: 빌라 이름 · 입주 · 오늘 완료 · 집값
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.ink;
  const nm = fitFont(ctx, villa.name, W - 2 * X0, 800, 76, 48);
  ctx.font = font(800, nm.px);
  ctx.fillText(nm.text, X0, 132);
  const done = villa.members.filter((m) => m.certifiedToday).length;
  const chips: [string, string][] = [
    ["입주", `${villa.members.length}/${capacity}명`],
    ["오늘 완료", `${done}명`],
    ...(villa.price != null ? ([[`${kindLabel(villa.kind)} 집값`, formatPrice(villa.price)]] as [string, string][]) : []),
  ];
  let cxp = X0;
  ctx.textBaseline = "middle";
  for (const [label, value] of chips) {
    ctx.font = font(600, 30);
    const lw = ctx.measureText(label).width;
    ctx.font = font(800, 30);
    const vw = ctx.measureText(value).width;
    const w = lw + vw + 12 + 48;
    if (cxp + w > W - X0) break;
    roundRectPath(ctx, cxp + 1.5, 178 + 1.5, w - 3, 60 - 3, 30);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = font(600, 30);
    ctx.fillText(label, cxp + 24, 209);
    ctx.fillStyle = C.ink;
    ctx.font = font(800, 30);
    ctx.fillText(value, cxp + 24 + lw + 12, 209);
    cxp += w + 14;
  }

  // 지붕
  fillRound(ctx, X0 - 6 * k, headH, BW + 12 * k, roofH + 4 * k, 4 * k, C.ink);
  if (apt) {
    ctx.fillStyle = C.glow;
    ctx.font = font(800, 11 * k);
    ctx.textAlign = "center";
    ctx.fillText(Array.from(kindLabel("apartment")).join(" "), W / 2, headH + roofH / 2 + k);
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(X0, headH + roofH, BW, entryY - headH - roofH);

  // 줄 (층 · 빈 층 · 빈방 n개) 과 양옆 벽
  const wall = 2 * k;
  for (const b of bands) {
    if (b.kind === "ph") {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, "#FBF7EA");
      g.addColorStop(1, "#fff");
      roundRectPath(ctx, X0, b.y, BW, b.h + 10 * k, 10 * k);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(X0, b.y, BW, b.h);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(X0 - wall, b.y - wall, BW + 2 * wall, b.h + wall);
      ctx.clip();
      roundRectPath(ctx, X0 + wall / 2, b.y + wall / 2, BW - wall, b.h + 20 * k, 10 * k);
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = wall;
      ctx.stroke();
      ctx.restore();
      // 세로 글씨 PENTHOUSE
      ctx.save();
      ctx.translate(X0 + phPad + phLabelW / 2, b.y + b.h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = C.gold;
      ctx.font = font(700, 12 * k);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = "PENTHOUSE";
      // 글자 사이 간격(letter-spacing 2px)을 흉내 낸다
      const chs = Array.from(label);
      const ls = 2 * k;
      const tw = chs.reduce((s, c) => s + ctx.measureText(c).width + ls, -ls);
      let tx = -tw / 2;
      ctx.textAlign = "left";
      for (const c of chs) {
        ctx.fillText(c, tx, 0);
        tx += ctx.measureText(c).width + ls;
      }
      ctx.restore();
      continue;
    }
    // 양옆 벽 (먹색)
    ctx.fillStyle = C.ink;
    ctx.fillRect(X0, b.y, wall, b.h);
    ctx.fillRect(X1 - wall, b.y, wall, b.h);
    if (b.kind === "gap" || b.kind === "more") {
      ctx.fillStyle = b.kind === "more" ? "#F7F8FA" : "#fff";
      ctx.fillRect(X0 + wall, b.y, BW - 2 * wall, b.h);
      if (b.kind === "gap") {
        ctx.fillStyle = "#F1F3F6";
        for (let x = X0 + wall + 22 * k; x < X1 - wall; x += 24 * k) ctx.fillRect(x, b.y, 2 * k, b.h);
        ctx.save();
        ctx.setLineDash([4 * k, 3 * k]);
        ctx.strokeStyle = "#D9DDE3";
        ctx.lineWidth = k;
        ctx.beginPath();
        ctx.moveTo(X0 + wall, b.y);
        ctx.lineTo(X1 - wall, b.y);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = C.muted;
      ctx.font = font(500, 12 * k);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label ?? "", W / 2, b.y + b.h / 2);
      continue;
    }
    // 층 줄: 위 경계선 · 층 번호
    ctx.fillStyle = C.line;
    ctx.fillRect(X0 + wall, b.y, BW - 2 * wall, k);
    if (b.label) {
      ctx.fillStyle = C.muted;
      ctx.font = font(700, 14 * k);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, X0 + pad + labelW / 2, b.y + b.h / 2);
    }
  }

  // 빈방 · 벽 칸
  for (const c of cells) {
    if (c.kind === "wall") {
      ctx.save();
      roundRectPath(ctx, c.x, c.y, tileW, tileH, 8 * k);
      ctx.clip();
      ctx.fillStyle = "#F3F4F7";
      ctx.fillRect(c.x, c.y, tileW, tileH);
      ctx.fillStyle = "#ECEEF2";
      for (let yy = c.y + 12 * k; yy < c.y + tileH; yy += 13 * k) ctx.fillRect(c.x, yy, tileW, k);
      ctx.restore();
    } else {
      fillRound(ctx, c.x, c.y, tileW, tileH, 8 * k, "#fff");
      ctx.save();
      ctx.setLineDash([5 * k, 3 * k]);
      roundRectPath(ctx, c.x + k, c.y + k, tileW - 2 * k, tileH - 2 * k, 8 * k);
      ctx.strokeStyle = "#D9DDE3";
      ctx.lineWidth = 2 * k;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C.muted;
      ctx.font = font(700, 12 * k);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("빈방", c.x + tileW / 2, c.y + tileH / 2);
    }
  }

  // 방: 그림 + 이름표 + 배지(나 · 방장 · +1층)
  tiles.forEach((t, i) => {
    const lit = t.m.certifiedToday;
    const th = t.sh + tagH + (t.ph ? 4 * k : 0);
    ctx.save();
    roundRectPath(ctx, t.x, t.y, t.w, th, 8 * k);
    ctx.clip();
    ctx.fillStyle = lit ? C.lit : C.dark;
    ctx.fillRect(t.x, t.y, t.w, th);
    const img = scenes[i];
    if (img) ctx.drawImage(img, t.x, t.y, t.w, t.sh);
    ctx.restore();
    if (t.m.userId === meId) {
      roundRectPath(ctx, t.x + k, t.y + k, t.w - 2 * k, th - 2 * k, 7.5 * k);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2 * k;
      ctx.stroke();
    }
    // 이름표: 닉네임(왼쪽, 길면 …) · 종목(오른쪽)
    const fs = (t.ph ? 13 : 11.5) * k;
    const ty = t.y + t.sh + (th - t.sh) / 2;
    ctx.textBaseline = "middle";
    ctx.font = font(500, fs * 0.92);
    const sport = SPORT_LABEL[t.m.sport] ?? "";
    const spw = ctx.measureText(sport).width;
    ctx.fillStyle = lit ? C.ink : C.darkInk;
    ctx.textAlign = "right";
    ctx.fillText(sport, t.x + t.w - 6 * k, ty);
    ctx.font = font(800, fs);
    ctx.textAlign = "left";
    ctx.fillText(fitText(t.m.nickname, t.w - 12 * k - spw - 6 * k, measureOf(ctx)), t.x + 6 * k, ty);
    // 배지
    const badges: [string, string, string][] = [];
    if (t.m.floorUpToday) badges.push(["+1층", "rgba(255,255,255,0.88)", "#555"]);
    if (t.m.userId === meId) badges.push(["나", C.accent, "#fff"]);
    if (t.m.userId === villa.ownerId) badges.push(["방장", C.gold, "#fff"]);
    let bx = t.x + t.w - 5 * k;
    ctx.font = font(700, 10 * k);
    for (const [text, bg, fg] of badges.reverse()) {
      const bw = ctx.measureText(text).width + 10 * k;
      bx -= bw;
      fillRound(ctx, bx, t.y + 5 * k, bw, 16 * k, 8 * k, bg);
      ctx.fillStyle = fg;
      ctx.textAlign = "center";
      ctx.fillText(text, bx + bw / 2, t.y + 13 * k);
      bx -= 3 * k;
    }
  });

  // 입구 · 문 · 땅
  ctx.fillStyle = C.ink;
  ctx.fillRect(X0, entryY, wall, entryH);
  ctx.fillRect(X1 - wall, entryY, wall, entryH);
  ctx.fillStyle = C.line;
  ctx.fillRect(X0 + wall, entryY, BW - 2 * wall, k);
  fillRound(ctx, W / 2 - 20 * k, groundY - 32 * k, 40 * k, 36 * k, 4 * k, C.ink);
  ctx.fillStyle = "#D9DDE3";
  ctx.fillRect(X0 - 10 * k, groundY, BW + 20 * k, groundH);
  ctx.fillStyle = C.ink;
  ctx.fillRect(X0 - 10 * k, groundY, BW + 20 * k, 2 * k);

  drawFooter(ctx, W, H - 70, icon);
  return canvasToBlob(canvas);
}
