export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 서버에 닿지 못했을 때 (와이파이 · 데이터가 끊김 등). 서비스 워커는 캐시하지 않으므로 화면에서 안내한다 */
export const OFFLINE_MESSAGE = "인터넷 연결이 불안정해요. 연결을 확인하고 다시 해 주세요";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    });
  } catch (e) {
    // 직접 멈춘 요청(abort)은 그대로 넘긴다
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, OFFLINE_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "문제가 생겼어요. 잠시 후 다시 해 주세요");
  return data as T;
}
