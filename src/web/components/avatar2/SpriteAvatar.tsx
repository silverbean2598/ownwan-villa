import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AvatarSpec } from "../../../shared/avatar";
import type { Pose } from "../avatar/poses";
import { spriteBox, spriteLayers, spriteMeta, spriteRes, type SpriteRes } from "./layers";
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

/**
 * 화면 가까이 왔을 때만 그림을 받는다 (빌라에 방이 50개까지 있다). 받을 때 실제로 그려질 크기를 재서
 * 작으면(세로 × 화면 배율 ≤ 160px) sm/ 작은 그림을 고른다. IntersectionObserver 가 없으면 바로 받는다
 */
function useSpriteRes<T extends SVGSVGElement>(fh: number) {
  const ref = useRef<T>(null);
  // null = 아직 받지 않음
  const [res, setRes] = useState<SpriteRes | null>(() => (typeof IntersectionObserver === "undefined" ? "full" : null));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 그림이 아직 없는 svg 는 getBoundingClientRect 가 0 이라 화면 변환(viewBox → 화면 px)으로 잰다
    const pick = () => {
      const m = el.getScreenCTM?.();
      const h = m ? fh * Math.hypot(m.b, m.d) : el.getBoundingClientRect().height;
      return spriteRes(h, typeof window === "undefined" ? 1 : window.devicePixelRatio);
    };
    if (typeof IntersectionObserver === "undefined") {
      setRes(pick());
      return;
    }
    if (res) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRes(pick());
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [res, fh]);
  return [ref, res] as const;
}

/**
 * 새 캐릭터: 같은 크기의 그림 띠(3칸)를 뒷머리 → 몸 → 앞머리 → 소품 → 바벨 순으로 겹치고,
 * 한 칸 크기의 svg 창으로 잘라 보여 준다. 칸 넘기기는 sprite.css 가 띠를 옮겨서 한다.
 * 요소 수 = svg 1 + 그림 3~4 (도복 자세는 머리가 몸 그림에 있어 1) + 낀 소품 수. 빌라 화면 DOM 을 작게.
 */
export function SpriteAvatar({ spec, size, pose = "idle", className, label = "캐릭터", x, y }: Props) {
  const [ref, res] = useSpriteRes<SVGSVGElement>(spriteMeta(pose).fh);
  const { meta, urls, outfit, hair, stripW } = spriteLayers(spec, pose, res ?? "full");
  const box = spriteBox(pose, size);
  return (
    <svg
      ref={ref}
      className={`spr p-${pose}${className ? ` ${className}` : ""}`}
      data-hair={hair || undefined}
      data-outfit={outfit}
      data-res={res ?? undefined}
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
      {res &&
        urls.map((u) => (
          <image key={u} href={u} width={stripW} height={meta.fh} preserveAspectRatio="none" {...ASYNC} />
        ))}
    </svg>
  );
}
