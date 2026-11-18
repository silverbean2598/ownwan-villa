export const EVENTS_POKE = "ownwan:events";

/** 이벤트가 생겼을 수 있는 동작(사진 인증 · 가구 구매) 뒤에 불러 EventCenter 가 바로 받아 오게 한다 */
export function pokeEvents() {
  try {
    window.dispatchEvent(new Event(EVENTS_POKE));
  } catch {}
}
