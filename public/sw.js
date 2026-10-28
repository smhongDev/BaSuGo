// 바수고 알림용 서비스 워커 (푸시 알림을 보여 주고, 누르면 해당 날짜 상세로 연다)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "바수고 알림";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: data.tag || "basugo",
      renotify: true,
      data: { url: data.url || "/my" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/my", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && "navigate" in c) return c.navigate(url).then((w) => w && w.focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});
