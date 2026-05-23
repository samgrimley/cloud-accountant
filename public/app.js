import { api } from "./js/api.js";
import { store } from "./js/store.js";
import { initChat, startTalkAbout, setMode } from "./js/chat.js";
import { renderAll } from "./js/views.js";
import { initVoice } from "./js/voice.js";
import { initPush } from "./js/push.js";

const $ = (sel) => document.querySelector(sel);

const loginEl = $("#login");
const appEl = $("#app");

async function boot() {
  const me = await api.me();
  store.setMeta(me);
  if (me.authed) {
    await enterApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginEl.hidden = false;
  appEl.hidden = true;
  $("#passphrase").focus();
}

async function enterApp() {
  loginEl.hidden = true;
  appEl.hidden = false;
  $("#disclaimer").hidden = sessionStorage.getItem("disclaimer-dismissed") === "1";

  await store.load();
  store.subscribe(renderAll);
  renderAll();
  initChat();
  initVoice();
  initPush();
  setupNav();
  setupSettings();
  applyDeepLink();
}

// --- login ---------------------------------------------------------------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#login-error");
  errEl.hidden = true;
  const passphrase = $("#passphrase").value;
  const btn = $("#login-btn");
  btn.disabled = true;
  const res = await api.login(passphrase);
  btn.disabled = false;
  if (res.ok) {
    await enterApp();
  } else {
    errEl.textContent = res.data?.error || "That didn't work.";
    errEl.hidden = false;
  }
});

// --- navigation ----------------------------------------------------------
function setupNav() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showScreen(tab.dataset.tab));
  });
}

export function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.hidden = s.dataset.screen !== name;
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.tab === name);
  });
}

function applyDeepLink() {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");
  const mode = params.get("mode");
  if (tab) showScreen(tab);
  if (mode) {
    showScreen("talk");
    setMode(mode);
  }
  if (tab || mode) history.replaceState({}, "", location.pathname);
}

// --- settings ------------------------------------------------------------
function setupSettings() {
  const dlg = $("#settings");
  $("#open-settings").addEventListener("click", () => {
    const s = store.state.settings;
    $("#set-speak").checked = s.speakReplies;
    $("#set-voice").value = s.voice || "alloy";
    $("#set-notif").checked = s.notifEnabled;
    $("#set-checkin").checked = s.checkinEnabled;
    $("#set-checkin-hour").value = s.checkinHour ?? 19;
    $("#notif-hint").textContent = store.meta.configured?.push
      ? "Action reminders and check-in prompts, sent sparingly."
      : "Notifications aren't configured on the server yet.";
    dlg.showModal();
  });

  $("#set-speak").addEventListener("change", (e) =>
    store.mutate("settings", "update", { speakReplies: e.target.checked })
  );
  $("#set-voice").addEventListener("change", (e) =>
    store.mutate("settings", "update", { voice: e.target.value })
  );
  $("#set-checkin").addEventListener("change", (e) =>
    store.mutate("settings", "update", { checkinEnabled: e.target.checked })
  );
  $("#set-checkin-hour").addEventListener("change", (e) =>
    store.mutate("settings", "update", { checkinHour: Number(e.target.value) })
  );
  $("#set-notif").addEventListener("change", async (e) => {
    if (e.target.checked) {
      const ok = await initPush(true);
      e.target.checked = ok;
      store.mutate("settings", "update", { notifEnabled: ok });
    } else {
      store.mutate("settings", "update", { notifEnabled: false });
    }
  });

  $("#logout-btn").addEventListener("click", async () => {
    await api.logout();
    location.reload();
  });
}

$("#dismiss-disclaimer").addEventListener("click", () => {
  $("#disclaimer").hidden = true;
  sessionStorage.setItem("disclaimer-dismissed", "1");
});

// expose for views.js "talk about this"
window.__talkAbout = startTalkAbout;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

boot();
