export class ImageDecodeError extends Error {
  constructor() {
    super("이 사진은 열 수 없어요");
    this.name = "ImageDecodeError";
  }
}

const MAX_EDGE = 1280;

/** 품질 0.8부터 0.1씩 낮추며 maxBytes 이하가 될 때까지 인코딩. 최저 0.5에서는 크더라도 마지막 결과를 돌려준다 */
export async function stepQuality(encode: (q: number) => Promise<Blob>, maxBytes = 150 * 1024): Promise<Blob> {
  let blob = await encode(0.8);
  for (let step = 1; blob.size > maxBytes && step <= 3; step++) {
    blob = await encode(Math.round((0.8 - step * 0.1) * 10) / 10);
  }
  return blob;
}

export async function compressImage(file: File): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new ImageDecodeError();
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await stepQuality(
      (q) =>
        new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageDecodeError())), "image/jpeg", q),
        ),
    );
  } finally {
    bmp.close?.();
  }
}
