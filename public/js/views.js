import { store } from "./store.js";

const $ = (s) => document.querySelector(s);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "onclick") el.onclick = v;
    else if (k === "html") el.innerHTML = v;
    else if (v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return el;
}

let wired = false;

export function renderAll() {
  wire();
  renderValues();
  renderActions();
  renderBasics();
  renderExercises();
  renderProgress();
}

function wire() {
  if (wired) return;
  wired = true;

  $("#add-value").onclick = async () => {
    const v = await openEditor("Add a value", [
      { name: "value", label: "The value (a direction)", type: "text" },
      { name: "area", label: "Life area", type: "text" },
      { name: "why", label: "Why it matters (optional)", type: "textarea" },
    ]);
    if (v?.value) store.mutate("value", "create", v);
  };

  $("#add-action").onclick = async () => {
    const v = await openEditor("Add an action", actionFields());
    if (v?.title) store.mutate("action", "create", normalizeAction(v));
  };

  $("#add-exercise").onclick = async () => {
    const v = await openEditor("Add an exercise", exerciseFields());
    if (v?.name) store.mutate("exercise", "create", normalizeExercise(v));
  };

  buildRating($("#rate-mood"));
  buildRating($("#rate-values"));
  $("#save-checkin").onclick = saveCheckin;
}

// --- VALUES --------------------------------------------------------------
function renderValues() {
  const list = $("#values-list");
  list.innerHTML = "";
  const vals = store.state.values;
  if (!vals.length) {
    list.appendChild(empty("No values yet. They'll grow as you talk — or add one here."));
    return;
  }
  for (const v of vals) {
    list.appendChild(
      h("div", { class: "card" },
        h("div", { class: "card-main" },
          h("div", { class: "card-title" }, v.value),
          v.area ? h("div", { class: "muted" }, v.area) : null,
          v.why ? h("div", { class: "card-note" }, v.why) : null
        ),
        h("div", { class: "card-actions" },
          talkBtn(`I'd like to talk about my value: ${v.value}`),
          editBtn(async () => {
            const e = await openEditor("Edit value", [
              { name: "value", label: "The value", type: "text", value: v.value },
              { name: "area", label: "Life area", type: "text", value: v.area },
              { name: "why", label: "Why it matters", type: "textarea", value: v.why },
            ]);
            if (e?.value) store.mutate("value", "update", { id: v.id, ...e });
          }),
          delBtn(() => store.mutate("value", "delete", { id: v.id }))
        )
      )
    );
  }
}

// --- ACTIONS (WEEK) ------------------------------------------------------
function renderActions() {
  const list = $("#actions-list");
  list.innerHTML = "";
  const acts = store.state.actions;

  renderAceBalance(acts.filter((a) => !a.done));

  if (!acts.length) {
    list.appendChild(empty("No actions yet. Plan one in Talk, or add it here."));
    return;
  }
  for (const a of acts) {
    const cb = h("input", { type: "checkbox", class: "done-box" });
    cb.checked = a.done;
    cb.onchange = () => store.mutate("action", "toggle", { id: a.id, done: cb.checked });

    list.appendChild(
      h("div", { class: "card action" + (a.done ? " is-done" : "") },
        cb,
        h("div", { class: "card-main" },
          h("div", { class: "card-title" }, a.title),
          h("div", { class: "tags" }, ...(a.ace || []).map((x) => h("span", { class: "ace ace-" + x }, x))),
          a.when ? h("div", { class: "muted" }, a.when) : null,
          a.valueLabel ? h("div", { class: "muted" }, "toward: " + a.valueLabel) : null,
          a.tinyStep ? h("div", { class: "card-note" }, "First step: " + a.tinyStep) : null,
          a.reminderAt ? h("div", { class: "reminder" }, "⏰ " + fmtWhen(a.reminderAt)) : null
        ),
        h("div", { class: "card-actions" },
          talkBtn(`Let's talk about this step: ${a.title}`),
          editBtn(async () => {
            const e = await openEditor("Edit action", actionFields(a));
            if (e?.title) store.mutate("action", "update", { id: a.id, ...normalizeAction(e) });
          }),
          delBtn(() => store.mutate("action", "delete", { id: a.id }))
        )
      )
    );
  }
}

function renderAceBalance(openActions) {
  const box = $("#ace-balance");
  box.innerHTML = "";
  const counts = { A: 0, C: 0, E: 0 };
  for (const a of openActions) for (const x of a.ace || []) if (counts[x] != null) counts[x]++;
  const missing = ["A", "C", "E"].filter((k) => counts[k] === 0);
  box.appendChild(
    h("div", { class: "balance-row" },
      ...["A", "C", "E"].map((k) =>
        h("span", { class: "balance-pill ace-" + k }, `${k} ${counts[k]}`)
      )
    )
  );
  if (openActions.length && missing.length) {
    const names = { A: "achievement", C: "connection", E: "enjoyment" };
    box.appendChild(
      h("p", { class: "hint" },
        "Maybe round out the week with some " + missing.map((m) => names[m]).join(" and ") + "."
      )
    );
  }
}

// --- BASICS --------------------------------------------------------------
const BASICS = [
  ["moved", "Moved my body"],
  ["ate", "Ate something"],
  ["slept", "Rested / slept"],
  ["phoneFree", "Phone-free time"],
  ["connected", "Connected with someone"],
];

function renderBasics() {
  const box = $("#basics");
  box.innerHTML = "";
  const b = store.state.basics;
  for (const [key, label] of BASICS) {
    const on = b[key];
    box.appendChild(
      h("button", {
        class: "basic-chip" + (on ? " on" : ""),
        type: "button",
        onclick: () => store.mutate("basics", "set", { field: key, value: !on }),
      }, (on ? "✓ " : "") + label)
    );
  }
}

// --- EXERCISES -----------------------------------------------------------
function renderExercises() {
  const list = $("#exercises-list");
  list.innerHTML = "";
  const ex = store.state.exercises;
  if (!ex.length) {
    list.appendChild(empty("No saved exercises yet. The companion will offer some as you talk."));
    return;
  }
  for (const e of ex) {
    list.appendChild(
      h("div", { class: "card" },
        h("div", { class: "card-main" },
          h("div", { class: "card-title" }, e.name),
          e.type ? h("div", { class: "muted" }, e.type) : null,
          e.steps?.length
            ? h("ol", { class: "steps" }, ...e.steps.map((s) => h("li", {}, s)))
            : null,
          e.whenToUse ? h("div", { class: "card-note" }, e.whenToUse) : null
        ),
        h("div", { class: "card-actions" },
          editBtn(async () => {
            const v = await openEditor("Edit exercise", exerciseFields(e));
            if (v?.name) store.mutate("exercise", "update", { id: e.id, ...normalizeExercise(v) });
          }),
          delBtn(() => store.mutate("exercise", "delete", { id: e.id }))
        )
      )
    );
  }
}

// --- PROGRESS ------------------------------------------------------------
function buildRating(container) {
  container.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const b = h("button", { class: "rate", type: "button" }, String(i));
    b.dataset.val = i;
    b.onclick = () => {
      container.dataset.selected = i;
      [...container.children].forEach((c) =>
        c.classList.toggle("on", Number(c.dataset.val) <= i)
      );
    };
    container.appendChild(b);
  }
}

async function saveCheckin() {
  const mood = Number($("#rate-mood").dataset.selected || 0) || null;
  const valuesLiving = Number($("#rate-values").dataset.selected || 0) || null;
  const note = $("#checkin-note").value.trim();
  if (!mood && !valuesLiving && !note) return;
  await store.mutate("checkin", "create", { mood, valuesLiving, note });
  delete $("#rate-mood").dataset.selected;
  delete $("#rate-values").dataset.selected;
  $("#checkin-note").value = "";
  buildRating($("#rate-mood"));
  buildRating($("#rate-values"));
}

function renderProgress() {
  const box = $("#progress-chart");
  box.innerHTML = "";
  const data = store.state.checkins.filter((c) => c.mood != null || c.valuesLiving != null);
  if (data.length < 2) {
    box.appendChild(empty("Save a couple of check-ins to see how things move over time."));
    return;
  }
  box.appendChild(h("h2", { class: "section-h" }, "Over time"));
  box.appendChild(sparkline(data.map((d) => d.mood), "#5b8a72", "Mood"));
  box.appendChild(sparkline(data.map((d) => d.valuesLiving), "#c08457", "Living your values"));
}

function sparkline(values, color, label) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  const W = 280, H = 60, pad = 6;
  const wrap = h("div", { class: "spark" });
  wrap.appendChild(h("div", { class: "muted" }, label));
  if (pts.length < 2) return wrap;
  const maxX = Math.max(1, values.length - 1);
  const x = (i) => pad + (i / maxX) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - 1) / 4) * (H - 2 * pad);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  wrap.appendChild(h("div", { class: "spark-svg", html: svg }));
  return wrap;
}

// --- shared bits ---------------------------------------------------------
function empty(text) {
  return h("p", { class: "empty" }, text);
}
function talkBtn(prompt) {
  return h("button", { class: "mini-btn", type: "button", title: "Talk about this", onclick: () => window.__talkAbout?.(prompt) }, "Talk");
}
function editBtn(fn) {
  return h("button", { class: "mini-btn", type: "button", onclick: fn }, "Edit");
}
function delBtn(fn) {
  return h("button", {
    class: "mini-btn danger", type: "button",
    onclick: () => { if (confirm("Remove this?")) fn(); },
  }, "Remove");
}

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// --- editor fields -------------------------------------------------------
function actionFields(a = {}) {
  return [
    { name: "title", label: "The action", type: "text", value: a.title },
    { name: "ace", label: "Gives (achievement / connection / enjoyment)", type: "ace", value: a.ace },
    { name: "valueLabel", label: "Toward which value (optional)", type: "text", value: a.valueLabel },
    { name: "tinyStep", label: "Smallest first step (optional)", type: "text", value: a.tinyStep },
    { name: "when", label: "Rough when (optional)", type: "text", value: a.when },
    { name: "reminderAt", label: "Remind me at (optional)", type: "datetime-local", value: toLocalInput(a.reminderAt) },
  ];
}
function normalizeAction(v) {
  return {
    title: v.title,
    ace: v.ace || [],
    valueLabel: v.valueLabel,
    tinyStep: v.tinyStep,
    when: v.when,
    reminderAt: v.reminderAt ? new Date(v.reminderAt).toISOString() : null,
  };
}
function exerciseFields(e = {}) {
  return [
    { name: "name", label: "Name", type: "text", value: e.name },
    {
      name: "type", label: "Type", type: "select", value: e.type,
      options: ["defusion", "grounding", "acceptance", "breathing", "values"].map((t) => ({ value: t, label: t })),
    },
    { name: "steps", label: "Steps (one per line)", type: "textarea", rows: 4, value: (e.steps || []).join("\n") },
    { name: "whenToUse", label: "When it helps (optional)", type: "text", value: e.whenToUse },
  ];
}
function normalizeExercise(v) {
  return {
    name: v.name,
    type: v.type,
    steps: (v.steps || "").split("\n").map((s) => s.trim()).filter(Boolean),
    whenToUse: v.whenToUse,
  };
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

// --- generic editor dialog ----------------------------------------------
function openEditor(title, fields) {
  return new Promise((resolve) => {
    const dlg = $("#editor");
    $("#editor-title").textContent = title;
    const wrap = $("#editor-fields");
    wrap.innerHTML = "";
    const inputs = {};

    for (const f of fields) {
      const lab = h("label", { class: "field" }, h("span", {}, f.label));
      let inp;
      if (f.type === "textarea") {
        inp = h("textarea", { rows: f.rows || 2 });
        if (f.value) inp.value = f.value;
      } else if (f.type === "select") {
        inp = h("select", {}, ...f.options.map((o) => h("option", { value: o.value }, o.label)));
        if (f.value) inp.value = f.value;
      } else if (f.type === "ace") {
        inp = h("div", { class: "ace-pick" });
        const chosen = new Set(f.value || []);
        for (const k of ["A", "C", "E"]) {
          const b = h("button", { type: "button", class: "ace-toggle ace-" + k + (chosen.has(k) ? " on" : "") }, k);
          b.onclick = () => {
            chosen.has(k) ? chosen.delete(k) : chosen.add(k);
            b.classList.toggle("on");
          };
          inp.appendChild(b);
        }
        inp._get = () => [...chosen];
      } else {
        inp = h("input", { type: f.type || "text" });
        if (f.value) inp.value = f.value;
      }
      lab.appendChild(inp);
      wrap.appendChild(lab);
      inputs[f.name] = inp;
    }

    const onClose = () => {
      dlg.removeEventListener("close", onClose);
      if (dlg.returnValue !== "save") return resolve(null);
      const out = {};
      for (const [name, inp] of Object.entries(inputs)) {
        out[name] = inp._get ? inp._get() : inp.value.trim();
      }
      resolve(out);
    };
    dlg.addEventListener("close", onClose);
    dlg.showModal();
  });
}
