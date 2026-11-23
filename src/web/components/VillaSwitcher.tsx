import { Link } from "react-router-dom";
import { MAX_VILLAS_PER_USER, type MyVilla } from "../../shared/villa";

type Props = {
  villas: Pick<MyVilla, "id" | "name" | "certifiedToday">[];
  currentId: string;
  onPick: (id: string) => void;
  /** 3곳보다 적게 살면 [+ 아파트] (아파트 만들기)를 보여 준다 */
  showAdd?: boolean;
  label?: string;
};

/**
 * 아파트 바꾸기: 아파트 이름 탭. 아파트가 1곳뿐이면 그리지 않는다(예전 화면 그대로).
 * 오늘 그 아파트에 인증을 올렸으면 이름 옆에 작은 불(노란 점)이 켜진다.
 */
export function VillaSwitcher({ villas, currentId, onPick, showAdd = false, label = "내 아파트" }: Props) {
  if (villas.length < 2) return null;
  return (
    <nav className="villa-switch" aria-label={label}>
      <div className="villa-tabs" role="tablist">
        {villas.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={v.id === currentId}
            className={`villa-tab${v.id === currentId ? " on" : ""}`}
            onClick={() => v.id !== currentId && onPick(v.id)}
          >
            <span className={`lamp${v.certifiedToday ? " lit" : ""}`} aria-hidden="true" />
            <span className="villa-tab-name">{v.name}</span>
            <span className="sr-only">{v.certifiedToday ? " (오늘 올림)" : ""}</span>
          </button>
        ))}
        {showAdd && villas.length < MAX_VILLAS_PER_USER && (
          <Link className="villa-tab add" to="/villa/new" aria-label="아파트 더 만들기">
            +
          </Link>
        )}
      </div>
    </nav>
  );
}
