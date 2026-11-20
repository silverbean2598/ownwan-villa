/** 공유 카드 canvas 도우미: 그림 받기 · svg 를 그림으로 · 글자 · 둥근 사각형 */

/** 앱 글꼴 (theme.css 와 같다). svg 그림 안에서는 웹 글꼴을 못 쓰므로 글자는 canvas 에 직접 쓴다 */
export const FONT = '-apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
export const font = (weight: number, px: number) => `${weight} ${px}px ${FONT}`;

/** 그림 하나를 받는다. 못 받거나 오래 걸리면 null (그 층 없이 그린다) */
export function loadImage(src: string, timeoutMs = 10_000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (v: HTMLImageElement | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.decoding = "async";
    img.onload = () => finish(img.naturalWidth > 0 || img.width > 0 ? img : null);
    img.onerror = () => finish(null);
    img.src = src;
  });
}

/** 같은 사이트 파일을 data: 주소로 (svg 그림 안의 <image> 는 바깥 파일을 못 읽어서 미리 넣어 둔다) */
export async function fetchDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** svg 글자 안의 같은 사이트 <image href="/..."> 를 data: 주소로 바꾼다. cache 는 여러 svg 가 함께 쓴다. 못 받은 그림은 뺀다 */
export async function inlineSvgImages(svg: string, cache: Map<string, Promise<string | null>>): Promise<string> {
  const urls = new Set<string>();
  for (const m of svg.matchAll(/href="(\/[^"]*)"/g)) urls.add(m[1]);
  const got = new Map<string, string | null>();
  await Promise.all(
    [...urls].map(async (u) => {
      if (!cache.has(u)) cache.set(u, fetchDataUrl(u));
      got.set(u, await cache.get(u)!);
    }),
  );
  return svg.replace(/href="(\/[^"]*)"/g, (_, u: string) => `href="${got.get(u) ?? ""}"`);
}

/** svg 글자 → 그림 (data: 주소라 canvas 가 더럽혀지지 않는다). 실패하면 null */
export function svgToImage(svg: string): Promise<HTMLImageElement | null> {
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, 15_000);
}

/** ctx.roundRect 가 없는 브라우저(예전 사파리)도 되게 직접 그린다 */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 글꼴이 다 받아질 때까지 (없으면 바로) */
export async function fontsReady() {
  try {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  } catch {}
}

/** canvas → PNG. 너무 크면(약 4MB 넘게) JPEG 로 */
export async function canvasToBlob(canvas: HTMLCanvasElement, maxPng = 4 * 1024 * 1024): Promise<Blob> {
  const as = (type: string, q?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  const png = await as("image/png");
  if (png && png.size <= maxPng) return png;
  const jpg = await as("image/jpeg", 0.9);
  if (jpg) return jpg;
  if (png) return png;
  throw new Error("이미지를 만들지 못했어요");
}

/** 고정 크기 canvas (기기 화면 배율과 상관없이 같은 크기) */
export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지를 만들 수 없어요");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}
