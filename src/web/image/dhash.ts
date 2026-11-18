/** 9x8 회색조 → 64비트 dHash (16자 hex). 각 행에서 왼쪽 픽셀이 오른쪽보다 밝으면 1 */
export function dhashFromGray(gray: Uint8Array): string {
  let hex = "";
  let nibble = 0;
  let bits = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      nibble = (nibble << 1) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1 : 0);
      if (++bits === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hex;
}

export async function dhashFromBlob(b: Blob): Promise<string> {
  const bmp = await createImageBitmap(b);
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, 9, 8);
  bmp.close?.();
  const { data } = ctx.getImageData(0, 0, 9, 8);
  const gray = new Uint8Array(72);
  for (let i = 0; i < 72; i++) {
    gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }
  return dhashFromGray(gray);
}
