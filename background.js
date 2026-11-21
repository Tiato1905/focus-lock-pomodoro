// ===== Cấu hình thời lượng (đổi số ở đây nếu muốn thử nghiệm) =====
const REAL_FOCUS_MS = 25 * 60 * 1000; // 25 phút
const REAL_BREAK_MS = 5 * 60 * 1000;  // 5 phút
const LONG_BREAK_MS = 15 * 60 * 1000; // 15 phút — nghỉ dài ở lần nghỉ thứ 4 khi bật chuỗi 4 phiên
const TEST_PHASE_MS = 10 * 1000;      // chế độ Test: 10 giây mỗi pha
const STORAGE_KEY = "focusLockState";
const SETTINGS_KEY = "focusLockSettings";
const TASKS_KEY = "focusLockTasks";
const ALARM_NAME = "phaseEnd";
const TRANSITION_DELAY_MS = 3000; // chờ 3 giây sau chuông rồi mới chuyển pha

const DEFAULT_STATE = {
  phase: "idle",       // 'idle' | 'focus' | 'break'
  running: false,
  phaseEndAt: null,    // timestamp (ms) khi pha hiện tại kết thúc
  remainingMs: null,   // chỉ có giá trị khi đang tạm dừng (pause)
  breakTabId: null,
  focusTabId: null,
  phaseTotalMs: null,  // tổng thời lượng của pha hiện tại (để vẽ đúng vòng tiến trình)
  cyclesCompleted: 0,
  activeTaskId: null,  // mục tiêu đang được tính Act Pomodoro khi hoàn thành 1 phiên
  sequenceCount: 0,    // số lần nghỉ ngắn đã xong trong chuỗi 4 phiên hiện tại (0-3)
  extraTabIds: []      // các tab người dùng mở trong giờ nghỉ (báo, mạng xã hội) — tự đóng khi hết giờ
};

const DEFAULT_SETTINGS = {
  testMode: false,
  theme: "dark",        // 'dark' | 'light'
  focusMs: 25 * 60 * 1000, // dùng khi sequenceEnabled = false
  breakMs: 5 * 60 * 1000,  // dùng khi sequenceEnabled = false
  sequenceEnabled: false, // bật "4 phiên Pomodoro liên tục": ép 25/5 x4, lần nghỉ thứ 4 là 15 phút
  blockListEnabled: false,
  blockList: ["tiktok.com", "instagram.com", "facebook.com", "x.com", "twitter.com"]
};

// Kiểm tra một URL có khớp danh sách chặn không (khớp cả tên miền con, ví dụ
// www.tiktok.com hay vt.tiktok.com đều khớp với "tiktok.com").
function isBlockedUrl(urlStr, blockList) {
  let hostname;
  try {
    hostname = new URL(urlStr).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  return (blockList || []).some((raw) => {
    const domain = raw.trim().toLowerCase().replace(/^www\./, "");
    if (!domain) return false;
    return hostname === domain || hostname.endsWith("." + domain);
  });
}

// Theo dõi mọi tab chuyển hướng URL. Nếu đang trong phiên tập trung, công tắc chặn đang
// bật, và trang khớp danh sách chặn -> tự điều hướng tab đó về trang chặn của Focus Lock.
// Cách này không cần host_permissions cho từng trang (khác với declarativeNetRequest kiểu
// "redirect", vốn bị Chrome âm thầm bỏ qua nếu thiếu quyền đó).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const state = await getState();
  if (state.phase !== "focus" || !state.running) return;
  const settings = await getSettings();
  if (!settings.blockListEnabled) return;
  if (!isBlockedUrl(changeInfo.url, settings.blockList)) return;

  let hostname = "";
  try { hostname = new URL(changeInfo.url).hostname; } catch (e) {}
  try {
    await chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL("blocked.html?site=" + encodeURIComponent(hostname))
    });
  } catch (e) {
    // tab có thể đã đóng ngay sau đó, bỏ qua
  }
});

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

async function setSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

// Thứ tự ưu tiên: Test (10s, để thử nhanh) > Chuỗi 4 phiên (ép 25/5, nghỉ dài ở lần 4)
// > thời lượng tự chọn của người dùng.
function resolveFocusMs(settings) {
  if (settings.testMode) return TEST_PHASE_MS;
  if (settings.sequenceEnabled) return REAL_FOCUS_MS;
  return Math.max(1000, settings.focusMs || REAL_FOCUS_MS);
}

function resolveBreakMs(settings, state) {
  if (settings.testMode) return TEST_PHASE_MS;
  if (settings.sequenceEnabled) {
    return state.sequenceCount >= 3 ? LONG_BREAK_MS : REAL_BREAK_MS;
  }
  return Math.max(1000, settings.breakMs || REAL_BREAK_MS);
}

// Đọc ô nhập thời lượng theo quy ước riêng của Focus Lock:
// - Giá trị từ 1 trở lên -> luôn là SỐ PHÚT NGUYÊN, bỏ qua phần thập phân nếu người dùng lỡ gõ.
// - Giá trị dưới 1 (dạng 0.xx) -> 2 chữ số sau dấu chấm chính là SỐ GIÂY (0.10 = 10 giây),
//   KHÔNG tính theo kiểu 0.1 phút = 6 giây.
function parseDurationInputToMs(raw, fallbackMs) {
  const str = String(raw ?? "").trim();
  if (!str) return fallbackMs;
  const [intPartStr, decPartStr = ""] = str.split(".");
  const intPart = parseInt(intPartStr || "0", 10);
  if (isNaN(intPart) || intPart < 0) return fallbackMs;

  if (intPart >= 1) {
    return intPart * 60 * 1000;
  }

  let secStr = decPartStr.slice(0, 2);
  if (secStr.length === 1) secStr += "0"; // "0.1" hiểu như "0.10" = 10 giây
  let seconds = parseInt(secStr, 10);
  if (isNaN(seconds) || seconds <= 0) return fallbackMs;
  if (seconds > 59) seconds = 59;
  return seconds * 1000;
}

async function getTasks() {
  const data = await chrome.storage.local.get(TASKS_KEY);
  return data[TASKS_KEY] || [];
}

async function setTasks(tasks) {
  await chrome.storage.local.set({ [TASKS_KEY]: tasks });
  return tasks;
}

// Khi một phiên tập trung (focus) vừa hoàn thành: tăng bộ đếm chung + tăng Act Pomodoro
// của mục tiêu đang chọn (nếu có).
async function recordCompletedFocusSession() {
  const state = await getState();
  await setState({ cyclesCompleted: state.cyclesCompleted + 1 });
  if (state.activeTaskId) {
    const tasks = await getTasks();
    const updated = tasks.map((t) =>
      t.id === state.activeTaskId ? { ...t, actPomos: (t.actPomos || 0) + 1 } : t
    );
    await setTasks(updated);
  }
}

async function getState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_STATE, ...(data[STORAGE_KEY] || {}) };
}

async function setState(partial) {
  const current = await getState();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

async function closeBreakTabIfAny(state) {
  if (state.breakTabId) {
    try {
      await chrome.tabs.remove(state.breakTabId);
    } catch (e) {
      // tab đã bị đóng từ trước, bỏ qua
    }
  }
}

async function closeFocusTabIfAny(state) {
  if (state.focusTabId) {
    try {
      await chrome.tabs.remove(state.focusTabId);
    } catch (e) {
      // tab đã bị đóng từ trước, bỏ qua
    }
  }
}

async function closeExtraTabsIfAny(state) {
  for (const id of state.extraTabIds || []) {
    try {
      await chrome.tabs.remove(id);
    } catch (e) {
      // tab đã bị đóng từ trước, bỏ qua
    }
  }
}

async function startFocus() {
  const state = await getState();
  const settings = await getSettings();
  const totalMs = resolveFocusMs(settings);
  const phaseEndAt = Date.now() + totalMs;
  try {
    // Mở tab mới TRƯỚC, chỉ đóng tab cũ khi đã chắc chắn tab mới mở thành công —
    // tránh tình huống hiếm khi mở tab lỗi mà tab cũ đã bị đóng, khiến người dùng
    // thấy "cả cửa sổ tắt luôn" thay vì chuyển pha.
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("focus.html") });
    await chrome.alarms.create(ALARM_NAME, { when: phaseEndAt });
    await closeBreakTabIfAny(state);
    await closeExtraTabsIfAny(state);
    await setState({
      phase: "focus",
      running: true,
      phaseEndAt,
      remainingMs: null,
      breakTabId: null,
      focusTabId: tab.id,
      phaseTotalMs: totalMs,
      extraTabIds: []
    });
    notify("Bắt đầu tập trung", settings.testMode ? "Chế độ Test: 10 giây tập trung." : "25 phút tập trung — hẹn gặp lại lúc nghỉ!");
  } catch (err) {
    console.error("Focus Lock: startFocus thất bại", err);
  }
}

async function startBreak() {
  const state = await getState();
  const settings = await getSettings();
  const totalMs = resolveBreakMs(settings, state);
  const phaseEndAt = Date.now() + totalMs;
  try {
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("break.html") });
    await chrome.alarms.create(ALARM_NAME, { when: phaseEndAt });
    await closeFocusTabIfAny(state);
    await setState({
      phase: "break",
      running: true,
      phaseEndAt,
      remainingMs: null,
      breakTabId: tab.id,
      focusTabId: null,
      phaseTotalMs: totalMs
    });
    notify("Đến giờ nghỉ", settings.testMode ? "Chế độ Test: 10 giây nghỉ." : "5 phút giải trí — màn hình sẽ tự khoá lại khi hết giờ.");
  } catch (err) {
    console.error("Focus Lock: startBreak thất bại", err);
  }
}

async function pause() {
  const state = await getState();
  if (!state.running || !state.phaseEndAt) return state;
  const remainingMs = Math.max(0, state.phaseEndAt - Date.now());
  await chrome.alarms.clear(ALARM_NAME);
  return setState({ running: false, remainingMs, phaseEndAt: null });
}

async function resume() {
  const state = await getState();
  if (state.running || state.phase === "idle" || state.remainingMs == null) return state;
  const phaseEndAt = Date.now() + state.remainingMs;
  await chrome.alarms.create(ALARM_NAME, { when: phaseEndAt });
  return setState({ running: true, phaseEndAt, remainingMs: null });
}

async function reset() {
  const state = await getState();
  await chrome.alarms.clear(ALARM_NAME);
  // QUAN TRỌNG: ghi trạng thái "idle" vào storage TRƯỚC khi đóng tab. Nếu đóng tab trước,
  // listener "tự mở lại tab nghỉ nếu bị đóng sớm" (bên dưới) có thể đọc storage trong lúc
  // nó vẫn còn thấy phase="break" và tự mở lại đúng tab vừa đóng — khiến Đặt lại "không ăn".
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...DEFAULT_STATE } });
  await closeBreakTabIfAny(state);
  await closeFocusTabIfAny(state);
  await closeExtraTabsIfAny(state);
  return DEFAULT_STATE;
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 1
  });
}

// Khi hết giờ của pha hiện tại: focus -> break -> focus -> ...
// Chờ TRANSITION_DELAY_MS (3 giây) trước khi thật sự chuyển, để trang đang mở
// (focus.html/break.html) kịp phát chuông báo hết giờ.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const state = await getState();
  if (state.phase === "focus") {
    await recordCompletedFocusSession();
    setTimeout(() => { startBreak().catch((e) => console.error("Focus Lock:", e)); }, TRANSITION_DELAY_MS);
  } else if (state.phase === "break") {
    const settings = await getSettings();
    if (settings.sequenceEnabled) {
      const wasLongBreak = state.sequenceCount >= 3;
      await setState({ sequenceCount: wasLongBreak ? 0 : state.sequenceCount + 1 });
    }
    setTimeout(() => { startFocus().catch((e) => console.error("Focus Lock:", e)); }, TRANSITION_DELAY_MS);
  }
});

// Nếu người dùng cố đóng tab nghỉ sớm, tự động mở lại khi vẫn còn giờ nghỉ
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (
    state.phase === "break" &&
    state.running &&
    state.breakTabId === tabId &&
    state.phaseEndAt &&
    state.phaseEndAt > Date.now()
  ) {
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("break.html") });
    await setState({ breakTabId: tab.id });
  }
});

// Giao tiếp với popup.js và break.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "GET_STATE":
        sendResponse(await getState());
        break;
      case "GET_SETTINGS":
        sendResponse(await getSettings());
        break;
      case "SET_TEST_MODE":
        sendResponse(await setSettings({ testMode: message.enabled }));
        break;
      case "SET_THEME":
        sendResponse(await setSettings({ theme: message.theme }));
        break;
      case "SET_DURATIONS": {
        const current = await getSettings();
        sendResponse(await setSettings({
          focusMs: parseDurationInputToMs(message.focusMinutes, current.focusMs),
          breakMs: parseDurationInputToMs(message.breakMinutes, current.breakMs)
        }));
        break;
      }
      case "SET_SEQUENCE":
        sendResponse(await setSettings({ sequenceEnabled: message.enabled }));
        break;
      case "SET_BLOCKLIST_ENABLED": {
        const s = await setSettings({ blockListEnabled: message.enabled });
        sendResponse(s);
        break;
      }
      case "SET_BLOCKLIST": {
        const s = await setSettings({ blockList: message.domains || [] });
        sendResponse(s);
        break;
      }
      case "GET_TASKS":
        sendResponse(await getTasks());
        break;
      case "SET_TASKS":
        sendResponse(await setTasks(message.tasks));
        break;
      case "SET_ACTIVE_TASK":
        sendResponse(await setState({ activeTaskId: message.taskId }));
        break;
      case "OPEN_BREAK_TAB": {
        // Mở tab do người dùng chọn trong giờ nghỉ (bài báo, mạng xã hội) và ghi nhớ id
        // để tự đóng lại khi hết giờ nghỉ — người dùng không bị lố giờ vì quên tab đó.
        const st = await getState();
        if (st.phase !== "break") { sendResponse(null); break; }
        const newTab = await chrome.tabs.create({ url: message.url });
        await setState({ extraTabIds: [...(st.extraTabIds || []), newTab.id] });
        sendResponse({ tabId: newTab.id });
        break;
      }
      case "START_FOCUS":
        sendResponse(await startFocus());
        break;
      case "PAUSE":
        sendResponse(await pause());
        break;
      case "RESUME":
        sendResponse(await resume());
        break;
      case "RESET":
        sendResponse(await reset());
        break;
      default:
        sendResponse(null);
    }
  })();
  return true; // giữ kênh phản hồi mở cho hàm async
});
