const REAL_FOCUS_MS = 25 * 60 * 1000;
const REAL_BREAK_MS = 5 * 60 * 1000;

const taskListEl = document.getElementById("taskList");
const addTaskBtn = document.getElementById("addTaskBtn");
const summaryPomos = document.getElementById("summaryPomos");
const summaryFinish = document.getElementById("summaryFinish");
const startFocusBtn = document.getElementById("startFocusBtn");

const editorOverlay = document.getElementById("editorOverlay");
const goalInput = document.getElementById("goalInput");
const goalError = document.getElementById("goalError");
const actInput = document.getElementById("actInput");
const estInput = document.getElementById("estInput");
const estUpBtn = document.getElementById("estUpBtn");
const estDownBtn = document.getElementById("estDownBtn");
const noteInput = document.getElementById("noteInput");
const deleteTaskBtn = document.getElementById("deleteTaskBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const saveTaskBtn = document.getElementById("saveTaskBtn");
const page = document.getElementById("page");

let tasks = [];
let activeTaskId = null;
let editingTaskId = null; // null = đang thêm mới

function sendMessage(type, extra) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}

sendMessage("GET_SETTINGS").then((settings) => {
  page.dataset.theme = settings.theme;
});

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

function genId() {
  return `t_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function renderTasks() {
  taskListEl.innerHTML = "";
  if (tasks.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-hint";
    p.textContent = "Chưa có mục tiêu nào — bấm \"+ Thêm mục tiêu\" bên dưới để bắt đầu.";
    taskListEl.appendChild(p);
    return;
  }

  tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "task-row" + (task.id === activeTaskId ? " active" : "");

    const radio = document.createElement("div");
    radio.className = "task-radio";
    radio.title = "Chọn làm mục tiêu đang thực hiện";
    radio.addEventListener("click", async (e) => {
      e.stopPropagation();
      activeTaskId = task.id;
      await sendMessage("SET_ACTIVE_TASK", { taskId: activeTaskId });
      renderTasks();
    });

    const main = document.createElement("div");
    main.className = "task-main";
    const name = document.createElement("div");
    name.className = "task-name";
    name.textContent = task.name;
    const progress = document.createElement("div");
    progress.className = "task-progress";
    progress.textContent = `${task.actPomos || 0} / ${task.estPomos} Pomodoro`;
    main.appendChild(name);
    main.appendChild(progress);
    main.addEventListener("click", () => openEditor(task));

    const del = document.createElement("button");
    del.className = "task-delete";
    del.textContent = "✕";
    del.title = "Xoá";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteTask(task.id);
    });

    row.appendChild(radio);
    row.appendChild(main);
    row.appendChild(del);
    taskListEl.appendChild(row);
  });
}

function renderSummary() {
  const totalAct = tasks.reduce((sum, t) => sum + (t.actPomos || 0), 0);
  const totalEst = tasks.reduce((sum, t) => sum + (t.estPomos || 0), 0);
  summaryPomos.textContent = `${totalAct} / ${totalEst}`;

  const remaining = Math.max(0, totalEst - totalAct);
  if (remaining === 0) {
    summaryFinish.textContent = totalEst === 0 ? "—" : "Đã xong!";
    return;
  }
  const remainingMs = remaining * (REAL_FOCUS_MS + REAL_BREAK_MS);
  const finishDate = new Date(Date.now() + remainingMs);
  const hh = finishDate.getHours().toString().padStart(2, "0");
  const mm = finishDate.getMinutes().toString().padStart(2, "0");
  const hours = Math.round((remainingMs / 3600000) * 10) / 10;
  summaryFinish.textContent = `${hh}:${mm} (${hours}h)`;
}

function openEditor(task) {
  editingTaskId = task ? task.id : null;
  goalInput.value = task ? task.name : "";
  actInput.value = task ? (task.actPomos || 0) : 0;
  estInput.value = task ? task.estPomos : 1;
  noteInput.value = task ? (task.note || "") : "";
  deleteTaskBtn.style.visibility = task ? "visible" : "hidden";
  goalError.hidden = true;
  editorOverlay.hidden = false;
  goalInput.focus();
}

goalInput.addEventListener("input", () => {
  if (goalInput.value.trim()) goalError.hidden = true;
});

function closeEditor() {
  editorOverlay.hidden = true;
  editingTaskId = null;
}

estUpBtn.addEventListener("click", () => {
  playClickSound();
  estInput.value = Math.max(1, parseInt(estInput.value || "1", 10) + 1);
});
estDownBtn.addEventListener("click", () => {
  playClickSound();
  const newEst = Math.max(1, parseInt(estInput.value || "1", 10) - 1);
  estInput.value = newEst;
  // Nếu giảm Dự kiến xuống thấp hơn Đã hoàn thành hiện tại, kéo Đã hoàn thành xuống theo
  if (parseInt(actInput.value || "0", 10) > newEst) {
    actInput.value = newEst;
  }
});

// Đã hoàn thành không được vượt quá Dự kiến, và không được âm
actInput.addEventListener("input", () => {
  const est = Math.max(1, parseInt(estInput.value || "1", 10));
  let act = parseInt(actInput.value || "0", 10);
  if (isNaN(act) || act < 0) act = 0;
  if (act > est) act = est;
  actInput.value = act;
});

addTaskBtn.addEventListener("click", () => { playClickSound(); openEditor(null); });
cancelEditBtn.addEventListener("click", () => { playClickSound(); closeEditor(); });

saveTaskBtn.addEventListener("click", async () => {
  playClickSound();
  const name = goalInput.value.trim();
  if (!name) {
    goalError.hidden = false;
    goalInput.focus();
    return;
  }
  goalError.hidden = true;
  const estPomos = Math.max(1, parseInt(estInput.value || "1", 10));
  const actPomos = Math.min(estPomos, Math.max(0, parseInt(actInput.value || "0", 10)));
  const note = noteInput.value.trim();

  if (editingTaskId) {
    tasks = tasks.map((t) => (t.id === editingTaskId ? { ...t, name, estPomos, actPomos, note } : t));
  } else {
    const newTask = { id: genId(), name, estPomos, actPomos, note };
    tasks.push(newTask);
    if (!activeTaskId) {
      activeTaskId = newTask.id;
      await sendMessage("SET_ACTIVE_TASK", { taskId: activeTaskId });
    }
  }
  await sendMessage("SET_TASKS", { tasks });
  closeEditor();
  renderTasks();
  renderSummary();
});

deleteTaskBtn.addEventListener("click", async () => {
  playClickSound();
  if (!editingTaskId) return;
  await deleteTask(editingTaskId);
  closeEditor();
});

async function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  await sendMessage("SET_TASKS", { tasks });
  if (activeTaskId === id) {
    activeTaskId = null;
    await sendMessage("SET_ACTIVE_TASK", { taskId: null });
  }
  renderTasks();
  renderSummary();
}

startFocusBtn.addEventListener("click", async () => {
  playClickSound();
  await sendMessage("START_FOCUS");
  chrome.tabs.getCurrent((tab) => {
    if (tab) chrome.tabs.remove(tab.id);
  });
});

async function init() {
  const [loadedTasks, state] = await Promise.all([
    sendMessage("GET_TASKS"),
    sendMessage("GET_STATE")
  ]);
  tasks = loadedTasks || [];
  activeTaskId = state.activeTaskId || null;
  renderTasks();
  renderSummary();
}

init();
