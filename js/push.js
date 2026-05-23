import { api } from "./api.js";
import { store } from "./store.js";

export async function initPush(force = false) {
  const key = store.meta.vapidPublicKey;
  if (!store.meta.configured?.push || !key) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  if (!force) {
    // Quiet re-sync: only if the user already opted in and granted permission.
    if (!store.state.settings.notifEnabled || Notification.permission !== "granted") return false;
  } else {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await api.pushSubscribe(sub.toJSON());
    return true;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
