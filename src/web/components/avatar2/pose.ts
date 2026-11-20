import type { Sport } from "../../../shared/sports";

/**
 * 새 캐릭터 그림 자세 (public/avatar2/<자세>). 종목 자세 + 서 있기(idle) · 잠(sleep)
 * + 보여 주기만 하는 축하(cheer) · 아쉬움(sad). cheer · sad 는 종목 목록에 넣지 않는다
 */
export type Pose = Sport | "idle" | "sleep" | "cheer" | "sad";
