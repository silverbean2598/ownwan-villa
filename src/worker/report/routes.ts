import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { jsonError, requireUser } from "../http";
import { canView } from "../cert/routes";
import { deletePhotoBlob } from "../storage";

export const report = new Hono<AppEnv>();

const HIDE_AT = 3;

type CertRow = { id: string; user_id: string; kind: string; r2_key: string | null };

async function findCert(env: Env, id: string) {
  return env.DB.prepare("SELECT id, user_id, kind, r2_key FROM certs WHERE id = ?").bind(id).first<CertRow>();
}

report.post("/api/certs/:id/report", requireUser, async (c) => {
  const viewerId = c.get("userId");
  const cert = await findCert(c.env, c.req.param("id"));
  if (!cert) return jsonError(c, 404, "사진을 찾을 수 없어요");
  if (!(await canView(c.env, viewerId, cert.user_id))) return jsonError(c, 403, "같은 빌라 입주민만 신고할 수 있어요");
  if (cert.user_id === viewerId) return jsonError(c, 400, "내 사진은 신고할 수 없어요");
  if (cert.kind !== "photo") return jsonError(c, 400, "사진만 신고할 수 있어요");
  // 신고 추가와 가림 판정을 한 묶음으로: 동시에 들어와도 마지막 신고가 3건을 본다
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO reports (cert_id, reporter_id) VALUES (?1, ?2)").bind(cert.id, viewerId),
    c.env.DB.prepare(
      "UPDATE certs SET hidden = 1 WHERE id = ?1 AND (SELECT COUNT(*) FROM reports WHERE cert_id = ?1) >= ?2",
    ).bind(cert.id, HIDE_AT),
  ]);
  const row = await c.env.DB.prepare("SELECT hidden FROM certs WHERE id = ?").bind(cert.id).first<{ hidden: number }>();
  return c.json({ hidden: !!row?.hidden });
});

report.delete("/api/certs/:id", requireUser, async (c) => {
  const viewerId = c.get("userId");
  const cert = await findCert(c.env, c.req.param("id"));
  if (!cert) return jsonError(c, 404, "기록을 찾을 수 없어요");
  if (cert.user_id !== viewerId) {
    // 작성자가 지금 사는 빌라의 방장이어야 한다 (방장 본인도 그 빌라 입주민)
    const row = await c.env.DB.prepare(
      `SELECT 1 AS ok FROM memberships m
       JOIN villas v ON v.id = m.villa_id AND v.dissolved_at IS NULL AND v.owner_id = ?1
       WHERE m.user_id = ?2 AND m.left_at IS NULL
         AND EXISTS (SELECT 1 FROM memberships o WHERE o.villa_id = m.villa_id AND o.user_id = ?1 AND o.left_at IS NULL)`,
    )
      .bind(viewerId, cert.user_id)
      .first();
    if (!row) return jsonError(c, 403, "지울 수 있는 권한이 없어요");
  }
  await deletePhotoBlob(c.env, cert);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM reports WHERE cert_id = ?").bind(cert.id),
    c.env.DB.prepare("DELETE FROM certs WHERE id = ?").bind(cert.id),
  ]);
  return c.json({ ok: true });
});
