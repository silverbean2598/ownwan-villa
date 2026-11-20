// public/avatar2/<pose>/meta.json + 그림 크기를 읽어 src/web/components/avatar2/manifest.ts 를 만든다.
// 새 그림(옷 색 · 소품)을 넣고 meta.json 의 outfits · accs 를 고친 뒤 `node scripts/gen-avatar2-manifest.mjs` 를 다시 돌리면 된다.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DIR = join(ROOT, "public/avatar2");
const OUT = join(ROOT, "src/web/components/avatar2/manifest.ts");
/** 작은 그림(sm/) 세로 px */
const SM_H = 160;

/** webp 머리말에서 가로 · 세로 (VP8X · VP8 · VP8L) */
function webpSize(file) {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") throw new Error(`webp 아님: ${file}`);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === "VP8L") {
    const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
    return [1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))];
  }
  throw new Error(`모르는 webp: ${file}`);
}

const out = {};
for (const pose of readdirSync(DIR).sort()) {
  const metaFile = join(DIR, pose, "meta.json");
  if (!existsSync(metaFile)) continue;
  const m = JSON.parse(readFileSync(metaFile, "utf8"));
  const sizes = new Set(readdirSync(join(DIR, pose)).filter((f) => f.endsWith(".webp")).map((f) => webpSize(join(DIR, pose, f)).join("x")));
  if (sizes.size !== 1) throw new Error(`${pose}: 층마다 그림 크기가 다르다 ${[...sizes]}`);
  const [sw, sh] = [...sizes][0].split("x").map(Number);
  if (sh !== m.frame_h) throw new Error(`${pose}: 세로 ${sh} ≠ frame_h ${m.frame_h}`);
  // 작은 그림(sm/): 같은 이름 · 세로 SM_H · 가로 = round(sw × SM_H / frame_h)
  const names = readdirSync(join(DIR, pose)).filter((f) => f.endsWith(".webp")).sort();
  const smDir = join(DIR, pose, "sm");
  const smNames = existsSync(smDir) ? readdirSync(smDir).filter((f) => f.endsWith(".webp")).sort() : [];
  if (names.join() !== smNames.join()) throw new Error(`${pose}: sm/ 그림 목록이 다르다`);
  const smSizes = new Set(smNames.map((f) => webpSize(join(smDir, f)).join("x")));
  const smSw = Math.round((sw * SM_H) / m.frame_h);
  if (smSizes.size !== 1 || [...smSizes][0] !== `${smSw}x${SM_H}`) throw new Error(`${pose}: sm/ 크기 ${[...smSizes]} ≠ ${smSw}x${SM_H}`);
  for (const a of m.accs ?? []) if (!names.includes(`acc-${a}.webp`)) throw new Error(`${pose}: acc-${a}.webp 없음`);
  for (const o of m.outfits) for (let s = 0; s < 4; s++) if (!names.includes(`body-${o}-s${s}.webp`)) throw new Error(`${pose}: body-${o}-s${s}.webp 없음`);
  out[pose] = {
    fw: m.frame_w,
    fh: m.frame_h,
    sw,
    smSw,
    frames: m.frames,
    outfits: m.outfits,
    hairs: m.hairs,
    props: !!m.props,
    accs: m.accs ?? [],
  };
}

writeFileSync(
  OUT,
  `// 자동 생성: node scripts/gen-avatar2-manifest.mjs (public/avatar2/*/meta.json). 손으로 고치지 않는다.
export type SpriteMeta = {
  /** 한 칸 가로 · 세로 (px) */
  fw: number;
  fh: number;
  /** 띠 그림 전체 가로 (칸 수 × fw 와 1~2px 다를 수 있다) */
  sw: number;
  /** sm/ 작은 그림(세로 ${SM_H}px) 띠 가로 */
  smSw: number;
  frames: number;
  outfits: readonly string[];
  hairs: readonly string[];
  props: boolean;
  accs: readonly string[];
};

/** 작은 그림(sm/) 세로 px */
export const SPRITE_SM_H = ${SM_H};

export const SPRITE_MANIFEST = ${JSON.stringify(out, null, 2)} as const satisfies Record<string, SpriteMeta>;
`,
);
console.log("wrote", OUT, Object.keys(out).join(", "));
