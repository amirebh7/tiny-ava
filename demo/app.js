// tiny-ava browser demo UI controller

const SAMPLES = [
  { label: "Greeting", text: "سلام، حال شما چطور است؟ امروز هوای تهران آفتابی است." },
  { label: "Ezafe + Kasra", text: "بارانِ ریزی روی آسفالتِ خیسِ خیابان می‌بارد." },
  { label: "Ezafe Chain", text: "نشست سران سیاسی کشورهای عضو به خوبی پیش رفت." },
  { label: "Homographs (گُل / گِل)", text: "گل قرمز زیبایی روی میز است، اما کفش‌هایم پر از گِل و لای شد." },
  { label: "Question", text: "آیا واقعاً فکر کردی که تولد تو را فراموش می‌کنم؟" },
  { label: "Colloquial", text: "سلام، چطوری؟ دیگه باید برم، نمی‌تونم بیشتر بمونم." },
  { label: "Long Paragraph", text: "توسعه مدل‌های کوچک هوش مصنوعی باعث می‌شود که فناوری تبدیل متن به گفتار بدون نیاز به سرور و اینترنت روی دستگاه‌های معمولی اجرا شود." },
];

const $ = (id) => document.getElementById(id);
const textEl = $("text");
const speedEl = $("speed"), speedVal = $("speedVal");
const pitchEl = $("pitch"), pitchVal = $("pitchVal");
const rangeEl = $("range"), rangeVal = $("rangeVal");
const goBtn = $("go"), stopBtn = $("stop");
const modelText = $("modeltext"), dlModelBtn = $("dlmodel"), rmModelLink = $("rmmodel");
const statusEl = $("status"), progEl = $("load");
const outEl = $("out"), player = $("player"), dlEl = $("dl"), statsEl = $("stats");
const waveCanvas = $("wave"), phonesEl = $("phones"), phonesBox = $("phonesBox");

let worker = null;
let ready = false;
let activeId = 0;
let currentWavUrl = null;
let currentAudioData = null;

// Populate sample chips
const chipsEl = $("samples");
SAMPLES.forEach((s) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = s.label;
  b.onclick = () => { textEl.value = s.text; textEl.focus(); };
  chipsEl.appendChild(b);
});

speedEl.oninput = () => { speedVal.textContent = Number(speedEl.value).toFixed(2) + "×"; };
pitchEl.oninput = () => {
  const st = Number(pitchEl.value);
  pitchVal.textContent = (st > 0 ? "+" : "") + st.toFixed(1) + " st";
};
rangeEl.oninput = () => { rangeVal.textContent = Number(rangeEl.value).toFixed(2); };

function encodeWav(samples, sampleRate) {
  const numSamples = samples.length;
  const buf = new ArrayBuffer(44 + numSamples * 2);
  const v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  v.setUint32(4, 36 + numSamples * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, numSamples * 2, true);
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    off += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

function drawWaveform(samples, progress = 0) {
  const dpr = window.devicePixelRatio || 1;
  const w = waveCanvas.clientWidth || 720;
  const h = waveCanvas.clientHeight || 110;
  waveCanvas.width = w * dpr;
  waveCanvas.height = h * dpr;
  const ctx = waveCanvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--accent").trim() || "#b4532a";
  const line = style.getPropertyValue("--line").trim() || "#d8cfc4";

  const bars = Math.min(180, Math.floor(w / 4));
  const step = Math.max(1, Math.floor(samples.length / bars));
  const barW = w / bars;
  const mid = h / 2;

  for (let i = 0; i < bars; i++) {
    let peak = 0;
    const start = i * step;
    const end = Math.min(samples.length, start + step);
    for (let j = start; j < end; j++) {
      const a = Math.abs(samples[j]);
      if (a > peak) peak = a;
    }
    const bh = Math.max(3, peak * (h - 14));
    ctx.fillStyle = (i / bars) <= progress ? accent : line;
    ctx.beginPath();
    ctx.roundRect(i * barW + 1, mid - bh / 2, Math.max(2, barW - 2), bh, 2);
    ctx.fill();
  }
}

waveCanvas.addEventListener("click", (e) => {
  if (!player.duration || !isFinite(player.duration)) return;
  const rect = waveCanvas.getBoundingClientRect();
  const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  player.currentTime = frac * player.duration;
  player.play().catch(() => {});
});

player.addEventListener("timeupdate", () => {
  if (currentAudioData && player.duration) {
    drawWaveform(currentAudioData, player.currentTime / player.duration);
  }
});

function setBusy(busy) {
  goBtn.disabled = busy;
  stopBtn.hidden = !busy;
}

function setStatus(msg, isErr = false) {
  statusEl.textContent = msg;
  statusEl.className = isErr ? "err" : "";
}

function updateModelBox(state) {
  if (state === "not_cached") {
    modelText.textContent = "Models (~29 MB) are not downloaded yet — fetched once and cached locally in this browser.";
    dlModelBtn.hidden = false;
    dlModelBtn.disabled = false;
    rmModelLink.hidden = true;
  } else if (state === "downloading") {
    modelText.textContent = "Downloading and initializing models in this browser (~29 MB)...";
    dlModelBtn.hidden = false;
    dlModelBtn.disabled = true;
    rmModelLink.hidden = true;
  } else if (state === "ready") {
    modelText.textContent = "Models ready in this browser (~29 MB cached — runs 100% offline).";
    dlModelBtn.hidden = true;
    rmModelLink.hidden = false;
  }
}

function initWorker() {
  if (worker) return;
  worker = new Worker("worker.js");
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === "cache_status") {
      if (m.cached) {
        updateModelBox("downloading");
        setStatus("Loading cached models...");
      } else {
        updateModelBox("not_cached");
        setStatus("");
      }
    } else if (m.type === "status") {
      setStatus(m.text);
      if (m.progress !== null && m.progress !== undefined) {
        progEl.hidden = false;
        progEl.value = m.progress;
      }
    } else if (m.type === "ready") {
      ready = true;
      progEl.hidden = true;
      updateModelBox("ready");
      setStatus("Ready.");
      goBtn.disabled = false;
    } else if (m.type === "cache_cleared") {
      ready = false;
      updateModelBox("not_cached");
      setStatus("Models removed from browser cache.");
    } else if (m.type === "done" && m.id === activeId) {
      setBusy(false);
      progEl.hidden = true;
      currentAudioData = m.audio;

      const blob = encodeWav(m.audio, m.sampleRate);
      if (currentWavUrl) URL.revokeObjectURL(currentWavUrl);
      currentWavUrl = URL.createObjectURL(blob);

      player.src = currentWavUrl;
      dlEl.href = currentWavUrl;
      dlEl.hidden = false;
      outEl.hidden = false;
      drawWaveform(currentAudioData, 0);

      const st = m.stats;
      const totalRtf = st.audioSec / Math.max(st.totalSec, 1e-4);
      const ttsRtf = st.audioSec / Math.max(st.ttsSec, 1e-4);
      statsEl.innerHTML = `
        <div class="stat"><span class="l">Audio</span><b>${st.audioSec.toFixed(2)}s</b><span class="c">${st.sentences} sentence${st.sentences > 1 ? "s" : ""} · 24 kHz</span></div>
        <div class="stat"><span class="l">Total Time</span><b>${st.totalSec.toFixed(2)}s</b><span class="c">G2P ${st.g2pSec.toFixed(2)}s + TTS ${st.ttsSec.toFixed(2)}s</span></div>
        <div class="stat"><span class="l">TTS Speed</span><b>${ttsRtf.toFixed(1)}×</b><span class="c">End-to-end ${totalRtf.toFixed(1)}× real-time</span></div>
        <div class="stat"><span class="l">Bundle Size</span><b>29 MB</b><span class="c">4.5M TTS + 8.3M G2P (ONNX)</span></div>
      `;
      phonesEl.textContent = m.phones;
      phonesBox.hidden = false;
      setStatus(`Done in ${st.totalSec.toFixed(2)}s.`);
      player.play().catch(() => {});
    } else if (m.type === "error") {
      setBusy(false);
      progEl.hidden = true;
      setStatus(m.message || "Error during synthesis.", true);
    }
  };
  worker.onerror = (e) => {
    setBusy(false);
    setStatus("Worker error: " + e.message, true);
  };
}

dlModelBtn.onclick = () => {
  initWorker();
  updateModelBox("downloading");
  goBtn.disabled = true;
  setStatus("Downloading models (~29 MB)...");
  worker.postMessage({ type: "load" });
};

goBtn.onclick = () => {
  const txt = textEl.value.trim();
  if (!txt) { setStatus("Please enter Persian text.", true); return; }
  initWorker();
  activeId++;
  setBusy(true);
  if (!ready) updateModelBox("downloading");
  setStatus(ready ? "Synthesizing..." : "Downloading models (~29 MB)...");
  // 0.058 log-F0 per semitone
  const pitchShift = Number(pitchEl.value) * 0.058;
  worker.postMessage({
    type: "speak",
    id: activeId,
    text: txt,
    speed: Number(speedEl.value),
    pitchShift,
    pitchRange: Number(rangeEl.value),
  });
};

stopBtn.onclick = () => {
  if (worker) worker.postMessage({ type: "cancel", id: activeId });
  activeId++;
  player.pause();
  setBusy(false);
  setStatus("Stopped.");
};

rmModelLink.onclick = (e) => {
  e.preventDefault();
  initWorker();
  worker.postMessage({ type: "clear_cache" });
};

// Check if already cached on load (loads immediately if cached; otherwise waits for user click)
initWorker();
worker.postMessage({ type: "check_cache" });
