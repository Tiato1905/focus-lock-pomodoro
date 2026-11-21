const REAL_FOCUS_MS = 25 * 60 * 1000;
const CIRCUMFERENCE = 723;

// Nhạc lofi không lời cho lúc tập trung.
// Bước 1: copy file .mp3 (và ảnh bìa nếu muốn) của bạn vào thư mục "media" cạnh file này.
// Bước 2: thêm một dòng cho mỗi bài — "cover" là tuỳ chọn, để trống nếu chưa có ảnh bìa:
// { name: "Tên bài", file: "media/ten-file.mp3", cover: "media/anh-bia.jpg" }
const FOCUS_TRACKS = [
   { name: "Lofi 1", file: "media/lofi (1).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 2", file: "media/lofi (2).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 3", file: "media/lofi (3).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 4", file: "media/lofi (4).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 5", file: "media/lofi (5).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 6", file: "media/lofi (6).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 7", file: "media/lofi (7).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 8", file: "media/lofi (8).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 9", file: "media/lofi (9).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 10", file: "media/lofi (10).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 11", file: "media/lofi (11).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 12", file: "media/lofi (12).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 13", file: "media/lofi (13).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 14", file: "media/lofi (14).mp3", cover: "media/focus1-cover.jpg" },
   { name: "Lofi 15", file: "media/lofi (15).mp3", cover: "media/focus1-cover.jpg" }

  // { name: "Lofi không lời 1", file: "media/focus1.mp3", cover: "media/focus1-cover.jpg" }
];

const timeDisplay = document.getElementById("timeDisplay");
const ringProgress = document.getElementById("ringProgress");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const resetBtn = document.getElementById("resetBtn");
const focusAudio = document.getElementById("focusAudio");
const miniTrackName = document.getElementById("miniTrackName");
const miniArt = document.getElementById("miniArt");
const miniPrevBtn = document.getElementById("miniPrevBtn");
const miniNextBtn = document.getElementById("miniNextBtn");
const miniPlayBtn = document.getElementById("miniPlayBtn");
const stage = document.getElementById("stage");

let currentTrackIndex = 0;

// Nhớ bài vừa nghe lần trước (kể cả giữa các phiên tập trung khác nhau) để không mở lại
// đúng bài đó ngay từ đầu mỗi phiên mới.
const LAST_TRACK_KEY = "focusLockLastFocusTrackIndex";

function pickRandomTrackIndex(excludeIndex) {
  const len = FOCUS_TRACKS.length;
  if (len <= 1) return 0;
  let idx;
  do { idx = Math.floor(Math.random() * len); } while (idx === excludeIndex);
  return idx;
}

function sendMessage(type, extra) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}

// Tiếng "tick" nhẹ khi bấm nút — tự tạo bằng Web Audio API, không cần file âm thanh.
function playClickSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) {}
}

sendMessage("GET_SETTINGS").then((settings) => {
  stage.dataset.theme = settings.theme;
});

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function applyCoverArt(coverPath) {
  if (coverPath) {
    miniArt.style.backgroundImage = `url('${chrome.runtime.getURL(coverPath)}')`;
    miniArt.style.backgroundSize = "cover";
    miniArt.style.backgroundPosition = "center";
    miniArt.textContent = "";
  } else {
    miniArt.style.backgroundImage = "";
    miniArt.textContent = "♪";
  }
}

function loadFocusTrack(index) {
  if (FOCUS_TRACKS.length === 0) {
    miniTrackName.textContent = "Chưa có nhạc — xem FOCUS_TRACKS trong focus.js";
    return;
  }
  currentTrackIndex = (index + FOCUS_TRACKS.length) % FOCUS_TRACKS.length;
  const track = FOCUS_TRACKS[currentTrackIndex];
  miniTrackName.textContent = track.name;
  applyCoverArt(track.cover);
  focusAudio.src = chrome.runtime.getURL(track.file);
  focusAudio.play().catch(() => {
    // Trình duyệt có thể chặn tự phát — bấm nút Play trên widget là được.
  });
  chrome.storage.local.set({ [LAST_TRACK_KEY]: currentTrackIndex });
}

miniPrevBtn.addEventListener("click", () => { playClickSound(); loadFocusTrack(currentTrackIndex - 1); });
miniNextBtn.addEventListener("click", () => { playClickSound(); loadFocusTrack(pickRandomTrackIndex(currentTrackIndex)); });
miniPlayBtn.addEventListener("click", () => {
  playClickSound();
  if (!focusAudio.src || FOCUS_TRACKS.length === 0) return;
  if (focusAudio.paused) {
    focusAudio.play().catch(() => {});
  } else {
    focusAudio.pause();
  }
});
focusAudio.addEventListener("play", () => { miniPlayBtn.textContent = "⏸"; });
focusAudio.addEventListener("pause", () => { miniPlayBtn.textContent = "▶"; });
focusAudio.addEventListener("ended", () => loadFocusTrack(pickRandomTrackIndex(currentTrackIndex)));
focusAudio.addEventListener("error", () => {
  if (FOCUS_TRACKS.length === 0) return;
  miniTrackName.textContent = "Không tìm thấy file nhạc — kiểm tra lại media/ và FOCUS_TRACKS";
});

// Chuông nhẹ báo hết giờ — tự tạo bằng Web Audio API, không cần file âm thanh.
let chimePlayed = false;
function playGentleChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.5);
  } catch (e) {
    // Một số trình duyệt chặn âm thanh tới khi có tương tác người dùng — bỏ qua, không quan trọng.
  }
}

function render(state) {
  const totalMs = state.phaseTotalMs != null ? state.phaseTotalMs : REAL_FOCUS_MS;
  let remaining;
  if (state.running && state.phaseEndAt) {
    remaining = state.phaseEndAt - Date.now();
  } else if (state.remainingMs != null) {
    remaining = state.remainingMs;
  } else {
    remaining = totalMs;
  }
  remaining = Math.max(0, remaining);

  if (remaining <= 0 && !chimePlayed) {
    chimePlayed = true;
    playGentleChime();
  }

  timeDisplay.textContent = formatTime(remaining);
  const progressFraction = 1 - remaining / totalMs;
  ringProgress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progressFraction));

  if (state.running) {
    pauseBtn.hidden = false;
    resumeBtn.hidden = true;
  } else {
    pauseBtn.hidden = true;
    resumeBtn.hidden = false;
  }
}

async function refresh() {
  const state = await sendMessage("GET_STATE");
  if (state.phase === "focus") render(state);
}

pauseBtn.addEventListener("click", async () => { playClickSound(); await sendMessage("PAUSE"); refresh(); });
resumeBtn.addEventListener("click", async () => { playClickSound(); await sendMessage("RESUME"); refresh(); });
resetBtn.addEventListener("click", async () => { playClickSound(); sendMessage("RESET"); });

chrome.storage.local.get(LAST_TRACK_KEY, (data) => {
  loadFocusTrack(pickRandomTrackIndex(data[LAST_TRACK_KEY]));
});
refresh();
setInterval(refresh, 500);
