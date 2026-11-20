// 오운완빌라 서비스 워커: 휴대폰 푸시 알림만 다룬다.
// 오프라인 캐시는 하지 않는다 (배포 뒤 예전 화면이 남는 문제를 피하려고). fetch 이벤트도 받지 않는다.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// 서버가 보낸 알림: { title, body, url, tag }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "오운완빌라";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "새 소식이 있어요",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // 같은 종류는 새 알림이 예전 알림을 바꾼다
      tag: data.tag || "ownwan",
      renotify: !!data.tag,
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/villa" },
    }),
  );
});

// 알림을 누르면: 이미 열린 앱 창이 있으면 그 창으로 가서 화면을 옮기고, 없으면 새로 연다
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/villa", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin !== self.location.origin) continue;
        await w.focus();
        if ("navigate" in w) {
          try {
            await w.navigate(url);
          } catch {
            // 이 워커가 제어하지 않는 창이면 navigate 가 안 될 수 있다: 초점만 옮긴다
          }
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
