/** 작은 빨간 숫자 배지. 0이면 아무것도 그리지 않는다. */
export function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="count-badge" role="status" aria-label={`알림 ${count}건`}>
      {count > 9 ? "9+" : count}
    </span>
  );
}
