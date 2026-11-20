/** 공유 카드 글자 배치 도우미. 글자 폭은 measure 로 잰다 (canvas 의 measureText, 시험에서는 글자 수) */
export type Measure = (s: string) => number;

const ELLIPSIS = "…";

/** 글자 단위(이모지 · 결합 문자 포함)로 나눈다 */
const chars = (s: string) => Array.from(s);

/** 한 줄에 들어가게 자르고, 잘렸으면 끝에 … */
export function fitText(text: string, maxWidth: number, measure: Measure): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (measure(t) <= maxWidth) return t;
  const cs = chars(t);
  // 들어가는 가장 긴 앞부분을 이분 탐색으로 찾는다
  let lo = 0;
  let hi = cs.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(cs.slice(0, mid).join("").trimEnd() + ELLIPSIS) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ELLIPSIS : cs.slice(0, lo).join("").trimEnd() + ELLIPSIS;
}

/**
 * 여러 줄로 나눈다. 줄바꿈은 그대로 살리고, 띄어쓰기에서 먼저 끊고, 한 낱말이 너무 길면 글자에서 끊는다.
 * maxLines 를 넘으면 마지막 줄 끝에 … (빈 줄은 버린다)
 */
export function wrapText(text: string, maxWidth: number, maxLines: number, measure: Measure): string[] {
  const lines: string[] = [];
  const paras = text.split(/\r?\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  let overflow = false;
  // 줄을 더한다. 이미 maxLines 줄이면 더하지 않고 넘침으로 표시
  const push = (l: string) => {
    if (lines.length >= maxLines) {
      overflow = true;
      return false;
    }
    lines.push(l);
    return true;
  };
  outer: for (const para of paras) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth) {
        line = next;
        continue;
      }
      if (line && !push(line)) break outer;
      line = "";
      // 낱말 하나가 한 줄보다 길면 글자에서 끊는다
      let rest = word;
      while (measure(rest) > maxWidth) {
        const cs = chars(rest);
        let n = 1;
        while (n < cs.length && measure(cs.slice(0, n + 1).join("")) <= maxWidth) n++;
        if (!push(cs.slice(0, n).join(""))) break outer;
        rest = cs.slice(n).join("");
      }
      line = rest;
    }
    if (line && !push(line)) break;
  }
  if (overflow && lines.length) {
    const last = lines.length - 1;
    const t = lines[last] + ELLIPSIS;
    // 들어가면 그대로 … 를 붙이고, 넘치면 앞부분만 남기고 … (fitText 가 끝의 … 를 잘라 내고 다시 붙인다)
    lines[last] = measure(t) <= maxWidth ? t : fitText(t, maxWidth, measure);
  }
  return lines;
}
