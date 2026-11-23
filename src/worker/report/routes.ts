import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { jsonError, requireUser } from "../http";
import { canViewCert, isModeratorOf } from "../cert/routes";
import { recomputePenthouse } from "../villa/service";
import { deletePhotoBlob } from "../storage";
import { cheerCleanupForCert } from "../cheer/routes";

export const report = new Hono<AppEnv>();

const HIDE_AT = 3;

type CertRow = { id: string; user_id: string; kind: string; r2_key: string | null; deleted: number };

async function findCert(env: Env, id: string) {
  return env.DB.prepare("SELECT id, user_id, kind, r2_key, deleted FROM certs WHERE id = ?").bind(id).first<CertRow>();
}

// 찾을 수 없음 문구: 사진이면 "사진", 루틴이거나 종류를 알 수 없으면 "기록"
const PHOTO_NOT_FOUND = "사진을 찾을 수 없어요";
const notFound = (cert: CertRow | null) => (cert?.kind === "photo" ? PHOTO_NOT_FOUND : "기록을 찾을 수 없어요");

report.post("/api/certs/:id/report", requireUser, async (c) => {
  const viewerId = c.get("userId");
  const cert = await findCert(c.env, c.req.param("id"));
  if (!cert || cert.deleted) return jsonError(c, 404, PHOTO_NOT_FOUND);
  if (!(await canViewCert(c.env, viewerId, cert))) return jsonError(c, 403, "같은 아파트 입주민만 신고할 수 있어요");
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
  if (!cert || cert.deleted) return jsonError(c, 404, notFound(cert));
  // 작성자 본인이거나, 기록이 올라간 아파트 중 작성자가 지금 사는 아파트의 방장이어야 한다 (방장 본인도 그 아파트 입주민).
  // 지우면 기록이 올라간 모든 아파트에서 사라진다
  if (cert.user_id !== viewerId && !(await isModeratorOf(c.env, viewerId, cert))) {
    return jsonError(c, 403, "지울 수 있는 권한이 없어요");
  }
  await deletePhotoBlob(c.env, cert);
  // 소프트 삭제: 사진 파일 · 글 내용 · 신고 · 응원 · 댓글은 지우고 행은 남긴다 (같은 날 순번 · 루틴 1회 · 중복 판정에 계속 쓰인다)
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM reports WHERE cert_id = ?").bind(cert.id),
    ...cheerCleanupForCert(c.env, cert.id),
    c.env.DB.prepare("UPDATE certs SET deleted = 1, body = NULL WHERE id = ?").bind(cert.id),
  ]);
  if (cert.kind === "photo") {
    // 이 기록이 올라간 아파트만 1등이 바뀔 수 있다
    const { results } = await c.env.DB.prepare("SELECT villa_id AS id FROM cert_villas WHERE cert_id = ?").bind(cert.id).all<{ id: string }>();
    for (const v of results) await recomputePenthouse(c.env, v.id);
  }
  return c.json({ ok: true });
});
