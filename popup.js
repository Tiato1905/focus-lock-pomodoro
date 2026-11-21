const REAL_FOCUS_MS = 25 * 60 * 1000;
const REAL_BREAK_MS = 5 * 60 * 1000;
const TEST_PHASE_MS = 10 * 1000;
const CIRCUMFERENCE = 553;

const wrap = document.getElementById("wrap");
const phaseLabel = document.getElementById("phaseLabel");
const timeDisplay = document.getElementById("timeDisplay");
const ringProgress = document.getElementById("ringProgress");
const hint = document.getElementById("hint");
const cyclesEl = document.getElementById("cycles");
const testToggle = document.getElementById("testToggle");
const themeToggle = document.getElementById("themeToggle");
const sequenceToggle = document.getElementById("sequenceToggle");
const focusMinutesInput = document.getElementById("focusMinutesInput");
const breakMinutesInput = document.getElementById("breakMinutesInput");
const durationRow = document.getElementById("durationRow");
const durationDisclosure = document.getElementById("durationDisclosure");
const durationBody = document.getElementById("durationBody");
const blockToggle = document.getElementById("blockToggle");
const blockListDisclosure = document.getElementById("blockListDisclosure");
const blockListBody = document.getElementById("blockListBody");
const blockListInput = document.getElementById("blockListInput");
const gearBtn = document.getElementById("gearBtn");
const settingsPanel = document.getElementById("settingsPanel");

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const resetBtn = document.getElementById("resetBtn");
const openSetupBtn = document.getElementById("openSetupBtn");

let tickHandle = null;

// Đếm số lệnh lưu cài đặt đang chờ xử lý. Trong lúc còn > 0, vòng làm mới mỗi 0,5 giây
// KHÔNG được vẽ lại các công tắc/ô nhập — nếu không, dữ liệu cũ lấy về trước đó sẽ ghi
// đè lên thao tác người dùng vừa thực hiện (khiến công tắc bị bật ngược lại).
let pendingSettingsWrites = 0;

async function saveSetting(type, extra) {
  pendingSettingsWrites += 1;
  try {
    await sendMessage(type, extra);
  } finally {
    pendingSettingsWrites -= 1;
  }
  refresh();
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
  } catch (e) {
    // Bỏ qua nếu trình duyệt chặn âm thanh.
  }
}

function sendMessage(type, extra) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function resolveTotalMs(state, settings) {
  if (state.phaseTotalMs != null) return state.phaseTotalMs;
  if (settings.testMode) return TEST_PHASE_MS;
  if (settings.sequenceEnabled) return REAL_FOCUS_MS;
  return settings.focusMs || REAL_FOCUS_MS;
}

// Hiện lại giá trị đã lưu (mili-giây) đúng theo quy ước nhập liệu: >=60 giây hiện là số
// phút nguyên; dưới 60 giây hiện dạng "0.SS" (giây nằm ở phần thập phân).
function formatDurationForInput(ms) {
  const totalSeconds = Math.round((ms || 0) / 1000);
  if (totalSeconds >= 60) return String(Math.round(totalSeconds / 60));
  return "0." + String(totalSeconds).padStart(2, "0");
}

function render(state, settings) {
  wrap.dataset.phase = state.phase;
  wrap.dataset.theme = settings.theme;

  // Chỉ đồng bộ lại các điều khiển cài đặt khi không có lệnh lưu nào đang chờ
  if (pendingSettingsWrites === 0) {
    testToggle.checked = settings.testMode;
    themeToggle.checked = settings.theme === "light";
    sequenceToggle.checked = settings.sequenceEnabled;

    // Không ghi đè ô đang được gõ dở
    if (document.activeElement !== focusMinutesInput) {
      focusMinutesInput.value = formatDurationForInput(settings.focusMs);
    }
    if (document.activeElement !== breakMinutesInput) {
      breakMinutesInput.value = formatDurationForInput(settings.breakMs);
    }
    durationRow.classList.toggle("disabled", settings.sequenceEnabled);
    focusMinutesInput.disabled = settings.sequenceEnabled;
    breakMinutesInput.disabled = settings.sequenceEnabled;

    blockToggle.checked = settings.blockListEnabled;
    if (document.activeElement !== blockListInput) {
      blockListInput.value = (settings.blockList || []).join(", ");
    }
  }

  const totalMs = resolveTotalMs(state, settings);
  let remaining;
  if (state.running && state.phaseEndAt) {
    remaining = state.phaseEndAt - Date.now();
  } else if (state.remainingMs != null) {
    remaining = state.remainingMs;
  } else {
    remaining = totalMs;
  }
  remaining = Math.max(0, remaining);

  timeDisplay.textContent = formatTime(remaining);
  const progressFraction = 1 - remaining / totalMs;
  ringProgress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progressFraction));

  cyclesEl.textContent = state.cyclesCompleted > 0
    ? `Đã hoàn thành ${state.cyclesCompleted} phiên tập trung`
    : "";

  if (state.phase === "idle") {
    phaseLabel.textContent = "Sẵn sàng";
    hint.textContent = settings.testMode
      ? "Chế độ Test đang bật — mỗi pha chỉ 10 giây."
      : "Bấm bắt đầu để vào phiên tập trung 25 phút.";
    show(startBtn); hide(pauseBtn); hide(resumeBtn);
  } else if (state.phase === "focus" && state.running) {
    phaseLabel.textContent = "Đang tập trung";
    hint.textContent = "Cố lên, sắp tới giờ nghỉ rồi.";
    hide(startBtn); show(pauseBtn); hide(resumeBtn);
  } else if (state.phase === "focus" && !state.running) {
    phaseLabel.textContent = "Đã tạm dừng";
    hint.textContent = "Bấm tiếp tục khi bạn sẵn sàng quay lại.";
    hide(startBtn); hide(pauseBtn); show(resumeBtn);
  } else if (state.phase === "break") {
    const isLongBreak = settings.sequenceEnabled && state.sequenceCount >= 3;
    phaseLabel.textContent = isLongBreak ? "Đang nghỉ dài" : "Đang nghỉ";
    hint.textContent = "Màn hình nghỉ đang mở ở tab riêng — hết giờ sẽ tự quay lại tập trung.";
    hide(startBtn); hide(pauseBtn); hide(resumeBtn);
  }
}

function show(el) { el.hidden = false; }
function hide(el) { el.hidden = true; }

async function refresh() {
  const [state, settings] = await Promise.all([
    sendMessage("GET_STATE"),
    sendMessage("GET_SETTINGS")
  ]);
  render(state, settings);
}

function startTicking() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(refresh, 500);
}

startBtn.addEventListener("click", async () => { playClickSound(); await sendMessage("START_FOCUS"); refresh(); });
pauseBtn.addEventListener("click", async () => { playClickSound(); await sendMessage("PAUSE"); refresh(); });
resumeBtn.addEventListener("click", async () => { playClickSound(); await sendMessage("RESUME"); refresh(); });
resetBtn.addEventListener("click", async () => { playClickSound(); await sendMessage("RESET"); refresh(); });

testToggle.addEventListener("change", () => {
  playClickSound();
  saveSetting("SET_TEST_MODE", { enabled: testToggle.checked });
});

themeToggle.addEventListener("change", () => {
  playClickSound();
  saveSetting("SET_THEME", { theme: themeToggle.checked ? "light" : "dark" });
});

function saveDurations() {
  saveSetting("SET_DURATIONS", {
    focusMinutes: focusMinutesInput.value,
    breakMinutes: breakMinutesInput.value
  });
}
focusMinutesInput.addEventListener("change", saveDurations);
breakMinutesInput.addEventListener("change", saveDurations);

sequenceToggle.addEventListener("change", () => {
  playClickSound();
  saveSetting("SET_SEQUENCE", { enabled: sequenceToggle.checked });
});

gearBtn.addEventListener("click", () => {
  playClickSound();
  settingsPanel.hidden = !settingsPanel.hidden;
});

function wireDisclosure(btn, body) {
  btn.addEventListener("click", () => {
    playClickSound();
    const isOpen = !body.hidden;
    body.hidden = isOpen;
    btn.setAttribute("aria-expanded", String(!isOpen));
  });
}
wireDisclosure(durationDisclosure, durationBody);
wireDisclosure(blockListDisclosure, blockListBody);

blockToggle.addEventListener("change", () => {
  playClickSound();
  saveSetting("SET_BLOCKLIST_ENABLED", { enabled: blockToggle.checked });
});

blockListInput.addEventListener("change", () => {
  const domains = blockListInput.value
    .split(/[\n,]/)
    .map((d) => d.trim())
    .filter(Boolean);
  saveSetting("SET_BLOCKLIST", { domains });
});

openSetupBtn.addEventListener("click", () => {
  playClickSound();
  chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
});

refresh();
startTicking();
