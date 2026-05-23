import { api } from "./api.js";
import { store } from "./store.js";

const $ = (s) => document.querySelector(s);

let recorder = null;
let chunks = [];
let recording = false;
let ttsAudio = null;

export function initVoice() {
  const micBtn = $("#mic");
  if (!store.meta.configured?.voice) {
    micBtn.style.display = "none";
    return;
  }
  micBtn.addEventListener("click", () => (recording ? stop() : start(micBtn)));
}

async function start(micBtn) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMime();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => finish(stream);
    recorder.start();
    recording = true;
    micBtn.classList.add("recording");
    micBtn.textContent = "■";
  } catch {
    flashInput("Microphone unavailable.");
  }
}

function stop() {
  if (recorder && recording) recorder.stop();
  recording = false;
  const micBtn = $("#mic");
  micBtn.classList.remove("recording");
  micBtn.textContent = "🎙";
}

async function finish(stream) {
  stream.getTracks().forEach((t) => t.stop());
  if (!chunks.length) return;
  const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
  const inputEl = $("#input");
  const prev = inputEl.placeholder;
  inputEl.placeholder = "Transcribing…";
  try {
    const base64 = await blobToBase64(blob);
    const res = await api.stt(base64, blob.type);
    if (res.ok && res.data?.text) {
      inputEl.value = (inputEl.value ? inputEl.value + " " : "") + res.data.text.trim();
      inputEl.dispatchEvent(new Event("input"));
      inputEl.focus();
    } else {
      flashInput(res.data?.error || "Couldn't transcribe that.");
    }
  } catch {
    flashInput("Couldn't transcribe that.");
  } finally {
    inputEl.placeholder = prev;
  }
}

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function flashInput(msg) {
  const inputEl = $("#input");
  const prev = inputEl.placeholder;
  inputEl.placeholder = msg;
  setTimeout(() => (inputEl.placeholder = prev), 2500);
}

export async function speakText(text) {
  if (!store.meta.configured?.voice) return;
  try {
    if (ttsAudio) {
      ttsAudio.pause();
      URL.revokeObjectURL(ttsAudio.src);
    }
    const blob = await api.tts(text, store.state.settings.voice);
    const url = URL.createObjectURL(blob);
    ttsAudio = new Audio(url);
    ttsAudio.play().catch(() => {});
  } catch {
    // silent — speech is a nicety, not essential
  }
}
