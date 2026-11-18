import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import { deletePhotoBlobs, getPhotoBlob, putPhotoBlob } from "./storage";

const d1Env = (): Env => ({ DB: env.DB, ASSETS: env.ASSETS, PHOTO_STORAGE: "d1" });
const r2Env = (): Env => ({ DB: env.DB, ASSETS: env.ASSETS, PHOTOS: env.PHOTOS, PHOTO_STORAGE: "r2" });

function bytes(n: number) {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = i % 251;
  return b;
}
async function read(r: { body: ReadableStream | ArrayBuffer | Uint8Array } | null) {
  return new Uint8Array(await new Response(r!.body as BodyInit).arrayBuffer());
}

describe.each([
  ["d1", d1Env],
  ["r2", r2Env],
])("storage %s", (_name, mk) => {
  it("puts_gets_and_deletes", async () => {
    const e = mk();
    const id = crypto.randomUUID();
    const key = `photos/u/${id}.jpg`;
    await putPhotoBlob(e, id, key, bytes(300 * 1024).buffer, "image/jpeg");
    const got = await getPhotoBlob(e, { id, r2_key: key });
    expect(got!.contentType).toBe("image/jpeg");
    expect(await read(got)).toEqual(bytes(300 * 1024));
    await deletePhotoBlobs(e, [{ id, r2_key: key }, { id: "none", r2_key: null }]);
    expect(await getPhotoBlob(e, { id, r2_key: key })).toBeNull();
  });
});

describe("storage backend choice", () => {
  it("defaults_to_d1_without_binding_and_r2_when_configured", async () => {
    const id = crypto.randomUUID();
    await putPhotoBlob({ DB: env.DB, ASSETS: env.ASSETS }, id, "k", bytes(10).buffer, "image/jpeg");
    expect(await env.DB.prepare("SELECT 1 AS x FROM photo_blobs WHERE cert_id = ?").bind(id).first()).not.toBeNull();
    const id2 = crypto.randomUUID();
    await putPhotoBlob(r2Env(), id2, `photos/x/${id2}.jpg`, bytes(10).buffer, "image/jpeg");
    expect(await env.DB.prepare("SELECT 1 AS x FROM photo_blobs WHERE cert_id = ?").bind(id2).first()).toBeNull();
    expect(await env.PHOTOS.head(`photos/x/${id2}.jpg`)).not.toBeNull();
  });
});

describe("photo routes on the d1 backend", () => {
  it("upload_get_and_account_delete_use_photo_blobs", async () => {
    const { app } = await import("./index");
    const e = { ...d1Env(), PHOTOS: undefined } as unknown as Env;
    const su = await app.request(
      "/api/signup",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: `d1u${Date.now().toString(36)}`.slice(0, 16), password: "password1", nickname: "운동러", over14: true, agree: true }),
      },
      e,
    );
    const cookie = su.headers.get("set-cookie")!.split(";")[0];
    const fd = new FormData();
    fd.set("file", new File([bytes(300 * 1024)], "a.jpg", { type: "image/jpeg" }));
    fd.set("dhash", "0f0f0f0f0f0f0f0f");
    const up = await app.request("/api/certs/photo", { method: "POST", headers: { cookie }, body: fd }, e);
    expect(up.status).toBe(200);
    const { certId } = await up.json<any>();
    const get = await app.request(`/api/photos/${certId}`, { headers: { cookie } }, e);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(bytes(300 * 1024));
    expect((await app.request("/api/me", { method: "DELETE", headers: { cookie } }, e)).status).toBe(200);
    expect(await env.DB.prepare("SELECT 1 AS x FROM photo_blobs WHERE cert_id = ?").bind(certId).first()).toBeNull();
  });
});
