import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { SpriteStillContext } from "../components/avatar2/SpriteAvatar";
import { inlineSvgImages, svgToImage } from "./canvas";

/** 공유 카드 캐릭터가 멈춰 있을 칸: 0→1→2 중 동작이 가장 큰 칸 (헬스는 다 들어 올린 칸) */
export const SHARE_FRAME = 2;

/**
 * 방 그림(RoomScene)을 화면 밖에 잠깐 그려 svg 글자로 꺼낸다. 캐릭터는 원본 그림 · 멈춘 칸으로.
 * w · h: 그림으로 바꿀 크기(px). svg 에 크기를 박아 두어 브라우저가 그 크기로 선명하게 그린다
 */
export function sceneMarkup(node: ReactElement, w: number, h: number): string {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.round(w)}px;visibility:hidden;pointer-events:none`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<SpriteStillContext.Provider value={{ frame: SHARE_FRAME }}>{node}</SpriteStillContext.Provider>));
    const svg = host.querySelector("svg.scene-bg");
    if (!svg) return "";
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(Math.round(w)));
    clone.setAttribute("height", String(Math.round(h)));
    clone.removeAttribute("class");
    const out = new XMLSerializer().serializeToString(clone);
    // 맨 바깥 svg 에 xmlns 가 꼭 한 번 있어야 그림으로 읽힌다 (브라우저마다 직렬화가 붙이기도, 안 붙이기도 한다)
    const head = out.slice(0, out.indexOf(">"));
    return head.includes('xmlns="http://www.w3.org/2000/svg"') ? out : out.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  } finally {
    root.unmount();
    host.remove();
  }
}

/** 방 그림 → canvas 에 그릴 그림. 가구 · 캐릭터 그림을 svg 안에 넣은 뒤 바꾼다. 실패하면 null */
export async function sceneImage(node: ReactElement, w: number, h: number, cache: Map<string, Promise<string | null>>) {
  const markup = sceneMarkup(node, w, h);
  if (!markup) return null;
  return svgToImage(await inlineSvgImages(markup, cache));
}
