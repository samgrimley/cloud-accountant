import { api } from "./api.js";
import { store } from "./store.js";
import { speakText } from "./voice.js";

const $ = (s) => document.querySelector(s);

let messages = [];
let conversationId = null;
let mode = "talk";
let busy = false;

let chatEl, inputEl, sendEl, formEl;

export function initChat() {
  chatEl = $("#chat");
  inputEl = $("#input");
  sendEl = $("#send");
  formEl = $("#composer");

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    send(inputEl.value);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(inputEl.value);
    }
  });

  inputEl.addEventListener("input", autoGrow);

  $("#new-chat").addEventListener("click", newChat);

  document.querySelectorAll(".mode").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  greet();
}

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
}

export function setMode(m) {
  mode = m;
  document.querySelectorAll(".mode").forEach((b) => {
    const on = b.dataset.mode === m;
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("is-active", on);
  });
}

function newChat() {
  messages = [];
  conversationId = null;
  chatEl.innerHTML = "";
  greet();
}

const GREETINGS = {
  talk: "I'm here. What's on your mind right now?",
  unhook: "Let's gently unhook from whatever's got a grip right now. What's the thought or feeling that's loudest?",
  values: "Let's find what matters to you. What's an area of life that feels important — or painful — lately?",
  plan: "Let's turn something that matters into one small, doable step. What would you like to move on?",
  checkin: "A quick, kind check-in. How are you doing today — and how have the basics been?",
};

function greet() {
  addBubble("assistant", GREETINGS[mode] || GREETINGS.talk);
}

function addBubble(role, text = "") {
  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text;
  chatEl.appendChild(el);
  scroll();
  return el;
}

function scroll() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

async function send(raw) {
  const text = (raw || "").trim();
  if (!text || busy) return;
  inputEl.value = "";
  autoGrow();
  addBubble("user", text);
  messages.push({ role: "user", text });

  busy = true;
  sendEl.disabled = true;
  const typing = addBubble("assistant typing", "…");
  let assistantEl = null;
  let acc = "";

  await api.chat(
    { messages, mode, conversationId },
    {
      onMeta: (p) => {
        if (p.conversationId) conversationId = p.conversationId;
      },
      onText: (delta) => {
        if (!assistantEl) {
          typing.remove();
          assistantEl = addBubble("assistant", "");
        }
        acc += delta;
        assistantEl.textContent = acc;
        scroll();
      },
      onSuggestion: (s) => renderSuggestion(s),
      onError: (msg) => {
        if (typing.isConnected) typing.remove();
        addBubble("assistant error", msg || "Something went wrong.");
      },
      onDone: () => {
        if (typing.isConnected) typing.remove();
        if (acc) {
          messages.push({ role: "assistant", text: acc });
          if (store.state.settings.speakReplies) speakText(acc);
        }
      },
    }
  );

  busy = false;
  sendEl.disabled = false;
  inputEl.focus();
}

// --- suggestion cards (structure crystallizing from talk) ----------------
function renderSuggestion({ name, input }) {
  const card = document.createElement("div");
  card.className = "suggestion";

  const label = {
    save_value: "Save this value",
    refine_value: "Refine this value",
    add_action: "Add this to your week",
    save_exercise: "Save this exercise",
  }[name] || "Keep this";

  const body = document.createElement("div");
  body.className = "suggestion-body";
  body.appendChild(tag(label));
  body.appendChild(describe(name, input));

  const btn = document.createElement("button");
  btn.className = "keep-btn";
  btn.textContent = "Keep";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    await keep(name, input);
    btn.textContent = "✓ Kept";
    card.classList.add("kept");
  });

  card.appendChild(body);
  card.appendChild(btn);
  chatEl.appendChild(card);
  scroll();
}

function tag(text) {
  const el = document.createElement("span");
  el.className = "suggestion-tag";
  el.textContent = text;
  return el;
}

function describe(name, input) {
  const el = document.createElement("div");
  el.className = "suggestion-text";
  if (name === "save_value" || name === "refine_value") {
    el.innerHTML = `<strong></strong>`;
    el.querySelector("strong").textContent = input.value || "";
    if (input.area) el.append(` · ${input.area}`);
    if (input.why) {
      const w = document.createElement("div");
      w.className = "muted";
      w.textContent = input.why;
      el.appendChild(w);
    }
  } else if (name === "add_action") {
    el.innerHTML = `<strong></strong>`;
    el.querySelector("strong").textContent = input.title || "";
    const meta = [];
    if (input.ace?.length) meta.push(input.ace.join("/"));
    if (input.when) meta.push(input.when);
    if (meta.length) el.append(` · ${meta.join(" · ")}`);
    if (input.tinyStep) {
      const t = document.createElement("div");
      t.className = "muted";
      t.textContent = "First step: " + input.tinyStep;
      el.appendChild(t);
    }
  } else if (name === "save_exercise") {
    el.innerHTML = `<strong></strong>`;
    el.querySelector("strong").textContent = input.name || "";
    if (input.steps?.length) {
      const ol = document.createElement("ol");
      input.steps.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        ol.appendChild(li);
      });
      el.appendChild(ol);
    }
  }
  return el;
}

async function keep(name, input) {
  if (name === "save_value") {
    await store.mutate("value", "create", {
      area: input.area,
      value: input.value,
      why: input.why,
    });
  } else if (name === "refine_value") {
    await store.mutate("value", "update", {
      id: input.id,
      value: input.value,
      area: input.area,
      why: input.why,
    });
  } else if (name === "add_action") {
    await store.mutate("action", "create", {
      title: input.title,
      ace: input.ace,
      valueLabel: input.value,
      tinyStep: input.tinyStep,
      when: input.when,
    });
  } else if (name === "save_exercise") {
    await store.mutate("exercise", "create", {
      name: input.name,
      type: input.type,
      steps: input.steps,
      whenToUse: input.whenToUse,
    });
  }
}

// Entry point from other screens: "talk about this".
export function startTalkAbout(prompt) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.hidden = s.dataset.screen !== "talk";
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.tab === "talk");
  });
  inputEl.value = prompt;
  autoGrow();
  inputEl.focus();
}
