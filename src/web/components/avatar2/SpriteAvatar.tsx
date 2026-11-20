import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AvatarSpec } from "../../../shared/avatar";
import type { Pose } from "../avatar/poses";
import { spriteBox, spriteLayers } from "./layers";
import "./sprite.css";

type Props = {
  spec: AvatarSpec;
  /** 옛 캐릭터(Avatar)와 같은 기준 크기. 실제 그림 크기는 spriteBox(pose, size) */
  size: number;
  pose?: Pose;
  className?: string;
  /** 접근성 이름 (기본 "캐릭터") */
  label?: string;
  /** svg 안에 넣을 때 위치 (바깥 svg 좌표). HTML 에서는 쓰이지 않는다 */
  x?: number;
  y?: number;
};

// svg <image> 의 decoding 은 React 타입에 없어 따로 붙인다
const ASYNC = { decoding: "async" } as object;

/** 화면 가까이 왔을 때만 그림을 받는다 (빌라에 방이 50개까지 있다). IntersectionObserver 가 없으면 바로 받는다 */
function useNearViewport<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near] as const;
}

/**
 * 새 캐릭터: 같은 크기의 그림 띠(3칸)를 뒷머리 → 몸 → 앞머리 → (소품) → 바벨 순으로 겹치고,
 * 한 칸 크기의 svg 창으로 잘라 보여 준다. 칸 넘기기는 sprite.css 가 띠를 옮겨서 한다.
 * 요소 수 = svg 1 + 그림 3~4 (빌라 화면 DOM 을 작게).
 */
export function SpriteAvatar({ spec, size, pose = "idle", className, label = "캐릭터", x, y }: Props) {
  const { meta, urls, outfit, hair } = spriteLayers(spec, pose);
  const box = spriteBox(pose, size);
  const [ref, near] = useNearViewport<SVGSVGElement>();
  return (
    <svg
      ref={ref}
      className={`spr p-${pose}${className ? ` ${className}` : ""}`}
      data-hair={hair}
      data-outfit={outfit}
      role="img"
      aria-label={label}
      x={x}
      y={y}
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${meta.fw} ${meta.fh}`}
      style={{ "--fw": `${meta.fw}px` } as CSSProperties}
      xmlns="http://www.w3.org/2000/svg"
    >
      {near &&
        urls.map((u) => (
          <image key={u} href={u} width={meta.sw} height={meta.fh} preserveAspectRatio="none" {...ASYNC} />
        ))}
    </svg>
  );
}
