import { Hono } from "hono";
import type { AppEnv } from "../env";
import { jsonError, requireUser } from "../http";
import { SPORTS } from "../../shared/sports";
import { isValidNickname } from "../../shared/nickname";
import { parseAvatar } from "../../shared/avatar";

export const profile = new Hono<AppEnv>();

profile.patch("/api/me", requireUser, async (c) => {
  const b = await c.req.json().catch(() => null);
  if (typeof b !== "object" || b === null) return jsonError(c, 400, "요청이 올바르지 않아요");
  const sets: string[] = [];
  const vals: (string | null)[] = [];

  if ("sport" in b) {
    if (!(SPORTS as readonly unknown[]).includes(b.sport)) return jsonError(c, 400, "종목을 다시 골라 주세요");
    sets.push("sport = ?");
    vals.push(b.sport);
  }
  if ("avatar" in b) {
    const a = parseAvatar(b.avatar);
    if (!a) return jsonError(c, 400, "캐릭터 설정이 올바르지 않아요");
    sets.push("avatar = ?");
    vals.push(JSON.stringify(a));
  }
  if ("nickname" in b) {
    const nickname = typeof b.nickname === "string" ? b.nickname.trim() : "";
    if (!isValidNickname(nickname)) return jsonError(c, 400, "닉네임은 2~10자로 입력해 주세요");
    sets.push("nickname = ?");
    vals.push(nickname);
  }
  if (sets.length) {
    await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...vals, c.get("userId"))
      .run();
  }
  return c.json({ ok: true });
});
