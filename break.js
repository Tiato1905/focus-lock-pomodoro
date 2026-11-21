// ============================================================
//  CẤU HÌNH — sửa 2 phần dưới đây theo ý bạn
// ============================================================

// QUAN TRỌNG: đổi dòng dưới đây thành URL thật của file yt-player.html bạn host trên
// GitHub Pages (cùng repo với trang chính sách quyền riêng tư), ví dụ:
// "https://ten-ban.github.io/ten-repo/yt-player.html"
const PLAYER_HOST = "https://tiato1905.github.io/Focus-Clock-Exstension--LamChuDongHoGenZ/yt-player.html";

// videoId là đoạn ký tự sau "v=" trong URL YouTube.
const BREAK_VIDEOS = [
  { name: "Tìm Em", videoId: "gJAbDSse5WM" },
  { name: "Ai Ngoài Anh", videoId: "cthtCRmTcgA" },
  { name: "Anh Yêu Em", videoId: "qM9woZ4i36Q" },
  { name: "Cho Con", videoId: "ERABWON9Qck" },
  { name: "Don't Côi", videoId: "1dlTWaiBZDw" },
  { name: "Sau Ngày Chia Tay", videoId: "Lig7cfxrAzg" },
  { name: "Ngày Em Đi", videoId: "6jsNgtaVaps" },
  { name: "Anh Sẽ Quên Được Em", videoId: "MR6zUAk6ayk" },
  { name: "Khoan Thai (Piano Version)", videoId: "UMXfW4Ex5Sw" },
  { name: "Có Chàng Trai Viết Lên Cây", videoId: "0VC6euBtKkk" },
  { name: "SAU LỜI TỪ KHƯỚC", videoId: "h_1t3-6oWz4" },
  { name: "Em", videoId: "6uVJqD2hSGQ" },
  { name: "Người Im Lặng Gặp Người Hay Nói", videoId: "8sVtL0o-v7U" }

];

// Nguồn báo (định dạng RSS). Muốn thêm nguồn khác: thêm một dòng theo đúng cấu trúc này,
// VÀ thêm tên miền của nó vào "host_permissions" trong manifest.json (thiếu là không tải được).
// Ghi chú: Reuters, National Geographic và The Economist đã bỏ/khoá RSS công khai, nên các
// nguồn đó lấy qua Google News RSS — vẫn đúng bài của họ, chỉ đi đường vòng.
const GNEWS = (domain, lang = "en-US", country = "US") =>
  `https://news.google.com/rss/search?q=when:24h+allinurl:${domain}&hl=${lang}&gl=${country}&ceid=${country}:${lang.split("-")[0]}`;

const NEWS_SOURCES = {
  tuoitre:   { label: "Tuổi Trẻ",             group: "vn", rss: "https://tuoitre.vn/rss/tin-moi-nhat.rss", site: "https://tuoitre.vn" },
  thanhnien: { label: "Thanh Niên",           group: "vn", rss: "https://thanhnien.vn/rss/home.rss", site: "https://thanhnien.vn" },
  vnexpress: { label: "VnExpress",            group: "vn", rss: "https://vnexpress.net/rss/tin-moi-nhat.rss", site: "https://vnexpress.net" },
  bbc:       { label: "BBC News",             group: "world", rss: "https://feeds.bbci.co.uk/news/rss.xml", site: "https://www.bbc.com/news" },
  nytimes:   { label: "The New York Times",   group: "world", rss: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", site: "https://www.nytimes.com" }
};

// ============================================================
//  Tiện ích dùng chung
// ============================================================
const stage = document.getElementById("stage");

function sendMessage(type, extra) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type, ...extra }, resolve));
}

sendMessage("GET_SETTINGS").then((settings) => {
  if (settings && settings.theme) stage.dataset.theme = settings.theme;
});

function playTone(freq, peak, dur) {
  try {
    const ctxA = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctxA.currentTime);
    gain.gain.exponentialRampToValueAtTime(peak, ctxA.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctxA.destination);
    osc.start();
    osc.stop(ctxA.currentTime + dur + 0.05);
  } catch (e) {}
}

const playClickSound = () => playTone(1000, 0.12, 0.09);
const playGentleChime = () => playTone(660, 0.15, 1.4);

// ============================================================
//  Đồng hồ đếm ngược + chuông + nút Đặt lại
// ============================================================
const countdownEl = document.getElementById("countdown");
const eyebrowEl = document.getElementById("breakEyebrow");
const resetBtn = document.getElementById("resetBtn");

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

let chimePlayed = false;

async function tick() {
  const [state, settings] = await Promise.all([
    sendMessage("GET_STATE"),
    sendMessage("GET_SETTINGS")
  ]);
  if (!state || state.phase !== "break" || !state.phaseEndAt) return;
  const isLongBreak = settings.sequenceEnabled && state.sequenceCount >= 3;
  eyebrowEl.textContent = isLongBreak ? "Giờ nghỉ dài" : "Giờ nghỉ";
  const remaining = state.phaseEndAt - Date.now();
  if (remaining <= 0 && !chimePlayed) {
    chimePlayed = true;
    playGentleChime();
  }
  countdownEl.textContent = formatTime(Math.max(0, remaining));
}

resetBtn.addEventListener("click", async () => {
  playClickSound();
  await sendMessage("RESET");
});

tick();
setInterval(tick, 1000);

// ============================================================
//  Widget nhạc YouTube — phát, chuyển bài và kéo đổi góc
// ============================================================
const miniPlayer = document.getElementById("miniPlayer");
const dragHandle = document.getElementById("dragHandle");
const ytFrame = document.getElementById("ytFrame");
const miniTrackName = document.getElementById("miniTrackName");
const miniPrevBtn = document.getElementById("miniPrevBtn");
const miniNextBtn = document.getElementById("miniNextBtn");
const miniPlayBtn = document.getElementById("miniPlayBtn");

let currentIndex = 0;
let isPlaying = true;

// Nhớ video vừa phát lần trước (kể cả giữa các lần nghỉ khác nhau) để không mở lại đúng
// video đó ngay từ đầu mỗi lần nghỉ mới — tránh cảm giác "lần nào cũng bài đầu tiên".
const LAST_VIDEO_KEY = "focusLockLastBreakVideoIndex";

function pickRandomIndex(excludeIndex) {
  const len = BREAK_VIDEOS.length;
  if (len <= 1) return 0;
  let idx;
  do { idx = Math.floor(Math.random() * len); } while (idx === excludeIndex);
  return idx;
}

function playerHostConfigured() {
  return !PLAYER_HOST.includes("ten-ban.github.io/ten-repo");
}

function sendYTCommand(func) {
  if (!ytFrame.contentWindow || !playerHostConfigured()) return;
  ytFrame.contentWindow.postMessage(
    JSON.stringify({ event: "command", func, args: [] }),
    new URL(PLAYER_HOST).origin
  );
}

function loadTrack(index) {
  if (!playerHostConfigured()) {
    miniTrackName.textContent = "Chưa cấu hình PLAYER_HOST trong break.js";
    return;
  }
  if (BREAK_VIDEOS.length === 0) {
    miniTrackName.textContent = "Chưa có video — xem BREAK_VIDEOS trong break.js";
    return;
  }
  currentIndex = (index + BREAK_VIDEOS.length) % BREAK_VIDEOS.length;
  const video = BREAK_VIDEOS[currentIndex];
  miniTrackName.textContent = video.name;
  isPlaying = true;
  miniPlayBtn.textContent = "⏸";
  ytFrame.src = `${PLAYER_HOST}?id=${encodeURIComponent(video.videoId)}`;
  chrome.storage.local.set({ [LAST_VIDEO_KEY]: currentIndex });
}

miniPrevBtn.addEventListener("click", () => { playClickSound(); loadTrack(currentIndex - 1); });
miniNextBtn.addEventListener("click", () => { playClickSound(); loadTrack(pickRandomIndex(currentIndex)); });
miniPlayBtn.addEventListener("click", () => {
  playClickSound();
  if (BREAK_VIDEOS.length === 0) return;
  isPlaying = !isPlaying;
  sendYTCommand(isPlaying ? "playVideo" : "pauseVideo");
  miniPlayBtn.textContent = isPlaying ? "⏸" : "▶";
});

window.addEventListener("message", (e) => {
  if (!playerHostConfigured() || e.origin !== new URL(PLAYER_HOST).origin) return;
  let data;
  try { data = JSON.parse(e.data); } catch (err) { return; }
  if (data.event === "onStateChange") {
    if (data.info === 0) loadTrack(pickRandomIndex(currentIndex)); // video kết thúc -> chọn ngẫu nhiên bài kế
    else if (data.info === 1) { isPlaying = true; miniPlayBtn.textContent = "⏸"; }
    else if (data.info === 2) { isPlaying = false; miniPlayBtn.textContent = "▶"; }
  }
});


// --- Kéo thả: thả ở đâu thì widget tự bám vào góc gần nhất, và nhớ vị trí đó ---
const CORNER_KEY = "focusLockPlayerCorner";

chrome.storage.local.get(CORNER_KEY, (data) => {
  const saved = data[CORNER_KEY];
  if (saved) miniPlayer.dataset.corner = saved;
});

let dragging = false;
let dragDX = 0;
let dragDY = 0;

dragHandle.addEventListener("mousedown", (e) => {
  dragging = true;
  const rect = miniPlayer.getBoundingClientRect();
  dragDX = e.clientX - rect.left;
  dragDY = e.clientY - rect.top;
  miniPlayer.classList.add("dragging");
  // Trong lúc kéo, bỏ bám góc để widget đi theo chuột
  miniPlayer.style.left = `${rect.left}px`;
  miniPlayer.style.top = `${rect.top}px`;
  miniPlayer.style.right = "auto";
  miniPlayer.style.bottom = "auto";
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  miniPlayer.style.left = `${e.clientX - dragDX}px`;
  miniPlayer.style.top = `${e.clientY - dragDY}px`;
});

window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  miniPlayer.classList.remove("dragging");

  // Xác định góc gần nhất dựa trên tâm widget
  const rect = miniPlayer.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const corner =
    (centerY < window.innerHeight / 2 ? "top" : "bottom") + "-" +
    (centerX < window.innerWidth / 2 ? "left" : "right");

  // Trả lại cho CSS quyết định vị trí theo góc đã chọn
  miniPlayer.style.left = "";
  miniPlayer.style.top = "";
  miniPlayer.style.right = "";
  miniPlayer.style.bottom = "";
  miniPlayer.dataset.corner = corner;
  chrome.storage.local.set({ [CORNER_KEY]: corner });
});

chrome.storage.local.get(LAST_VIDEO_KEY, (data) => {
  loadTrack(pickRandomIndex(data[LAST_VIDEO_KEY]));
});

// ============================================================
//  Chuyển đổi trò chơi
// ============================================================
let activeGame = "snake";
const gameTabs = document.getElementById("gameTabs");

gameTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  playClickSound();
  activeGame = btn.dataset.game;
  gameTabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
  ["snake", "g2048", "memory"].forEach((g) => {
    document.getElementById(`panel-${g}`).hidden = g !== activeGame;
  });
});

// ============================================================
//  Game 1 — Rắn săn mồi
// ============================================================
const canvas = document.getElementById("snakeCanvas");
const ctx = canvas.getContext("2d");
const snakeScoreEl = document.getElementById("snakeScore");

const GRID_SIZE = 16;
const CELL = canvas.width / GRID_SIZE;

let snake, direction, nextDirection, food, snakeScore, snakeRunning, snakeLoop;

function resetSnake() {
  snake = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
  direction = "RIGHT";
  nextDirection = "RIGHT";
  snakeScore = 0;
  snakeScoreEl.textContent = "0";
  placeFood();
  snakeRunning = false;
  drawSnake();
}

function placeFood() {
  do {
    food = { x: Math.floor(Math.random() * GRID_SIZE), y: Math.floor(Math.random() * GRID_SIZE) };
  } while (snake.some((s) => s.x === food.x && s.y === food.y));
}

function drawSnake() {
  ctx.fillStyle = "#0e1012";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e37a3a";
  ctx.fillRect(food.x * CELL, food.y * CELL, CELL - 2, CELL - 2);
  ctx.fillStyle = "#F7F3EC";
  snake.forEach((s) => ctx.fillRect(s.x * CELL, s.y * CELL, CELL - 2, CELL - 2));
  if (!snakeRunning) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#F7F3EC";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Bấm phím bất kỳ để chơi", canvas.width / 2, canvas.height / 2);
  }
}

function stepSnake() {
  direction = nextDirection;
  const head = { ...snake[0] };
  if (direction === "UP") head.y -= 1;
  if (direction === "DOWN") head.y += 1;
  if (direction === "LEFT") head.x -= 1;
  if (direction === "RIGHT") head.x += 1;

  const hitWall = head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE;
  if (hitWall || snake.some((s) => s.x === head.x && s.y === head.y)) {
    snakeRunning = false;
    clearInterval(snakeLoop);
    drawSnake();
    return;
  }

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    snakeScore += 1;
    snakeScoreEl.textContent = String(snakeScore);
    placeFood();
  } else {
    snake.pop();
  }
  drawSnake();
}

function startSnake() {
  resetSnake();
  snakeRunning = true;
  drawSnake();
  clearInterval(snakeLoop);
  snakeLoop = setInterval(stepSnake, 130);
}

const KEY_TO_DIR = {
  ArrowUp: "UP", w: "UP", W: "UP",
  ArrowDown: "DOWN", s: "DOWN", S: "DOWN",
  ArrowLeft: "LEFT", a: "LEFT", A: "LEFT",
  ArrowRight: "RIGHT", d: "RIGHT", D: "RIGHT"
};
const OPPOSITE = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };

resetSnake();

// ============================================================
//  Game 2 — 2048
// ============================================================
const grid2048El = document.getElementById("grid2048");
const score2048El = document.getElementById("score2048");
let board2048, score2048;

function reset2048() {
  board2048 = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  score2048 = 0;
  addRandomTile();
  addRandomTile();
  draw2048();
}

function addRandomTile() {
  const empty = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (board2048[r][c] === 0) empty.push([r, c]);
  if (empty.length === 0) return;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  board2048[r][c] = Math.random() < 0.9 ? 2 : 4;
}

function draw2048() {
  grid2048El.innerHTML = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = board2048[r][c];
      const cell = document.createElement("div");
      cell.className = "cell2048";
      cell.dataset.v = String(v);
      cell.textContent = v === 0 ? "" : String(v);
      grid2048El.appendChild(cell);
    }
  }
  score2048El.textContent = String(score2048);
}

// Gộp một hàng về phía bên trái; trả về hàng mới
function slideRow(row) {
  const nums = row.filter((n) => n !== 0);
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i] === nums[i + 1]) {
      nums[i] *= 2;
      score2048 += nums[i];
      nums.splice(i + 1, 1);
    }
  }
  while (nums.length < 4) nums.push(0);
  return nums;
}

function move2048(dir) {
  const before = JSON.stringify(board2048);

  // Xoay bàn cờ về dạng "gộp sang trái" rồi xoay ngược lại — tránh viết 4 nhánh riêng
  const rotate = (b, times) => {
    let out = b.map((r) => r.slice());
    for (let t = 0; t < times; t++) {
      const next = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) next[c][3 - r] = out[r][c];
      out = next;
    }
    return out;
  };

  const turns = { LEFT: 0, UP: 3, RIGHT: 2, DOWN: 1 }[dir];
  let work = rotate(board2048, turns);
  work = work.map(slideRow);
  board2048 = rotate(work, (4 - turns) % 4);

  if (JSON.stringify(board2048) !== before) {
    addRandomTile();
    draw2048();
  }
}

document.getElementById("restart2048").addEventListener("click", () => {
  playClickSound();
  reset2048();
});

reset2048();

// ============================================================
//  Game 3 — Lật hình
// ============================================================
const gridMemoryEl = document.getElementById("gridMemory");
const memoryMovesEl = document.getElementById("memoryMoves");
const MEMORY_ICONS = ["🍎", "🌿", "⭐", "🌙", "🔥", "💧", "🎵", "⚡"];
let memoryDeck, memoryFlipped, memoryMoves, memoryLock;

function resetMemory() {
  memoryDeck = [...MEMORY_ICONS, ...MEMORY_ICONS]
    .map((icon) => ({ icon, matched: false }))
    .sort(() => Math.random() - 0.5);
  memoryFlipped = [];
  memoryMoves = 0;
  memoryLock = false;
  memoryMovesEl.textContent = "0";
  drawMemory();
}

function drawMemory() {
  gridMemoryEl.innerHTML = "";
  memoryDeck.forEach((card, i) => {
    const btn = document.createElement("button");
    btn.className = "memory-card";
    btn.textContent = card.icon;
    if (card.matched) btn.classList.add("matched");
    else if (memoryFlipped.includes(i)) btn.classList.add("flipped");
    btn.addEventListener("click", () => flipMemory(i));
    gridMemoryEl.appendChild(btn);
  });
}

function flipMemory(i) {
  if (memoryLock || memoryDeck[i].matched || memoryFlipped.includes(i)) return;
  playClickSound();
  memoryFlipped.push(i);
  drawMemory();

  if (memoryFlipped.length === 2) {
    memoryMoves += 1;
    memoryMovesEl.textContent = String(memoryMoves);
    const [a, b] = memoryFlipped;
    if (memoryDeck[a].icon === memoryDeck[b].icon) {
      memoryDeck[a].matched = true;
      memoryDeck[b].matched = true;
      memoryFlipped = [];
      drawMemory();
    } else {
      memoryLock = true;
      setTimeout(() => {
        memoryFlipped = [];
        memoryLock = false;
        drawMemory();
      }, 700);
    }
  }
}

document.getElementById("restartMemory").addEventListener("click", () => {
  playClickSound();
  resetMemory();
});

resetMemory();

// ============================================================
//  Bàn phím — chỉ gửi phím cho trò chơi đang mở
// ============================================================
window.addEventListener("keydown", (e) => {
  if (activeGame === "snake") {
    if (!snakeRunning) { startSnake(); return; }
    const dir = KEY_TO_DIR[e.key];
    if (dir && OPPOSITE[dir] !== direction) nextDirection = dir;
  } else if (activeGame === "g2048") {
    const dir = { ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT" }[e.key];
    if (dir) { e.preventDefault(); move2048(dir); }
  }
});

// ============================================================
//  Công tắc lớn: Trò chơi / Tin tức
// ============================================================
const modeSwitch = document.getElementById("modeSwitch");
const sectionGame = document.getElementById("sectionGame");
const sectionNews = document.getElementById("sectionNews");
let currentMode = "game";

modeSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  playClickSound();
  currentMode = btn.dataset.mode;
  modeSwitch.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
  sectionGame.hidden = currentMode !== "game";
  sectionNews.hidden = currentMode !== "news";
});

// ============================================================
//  Đọc báo (RSS)
// ============================================================
const newsSelect = document.getElementById("newsSelect");
const newsList = document.getElementById("newsList");
const refreshNewsBtn = document.getElementById("refreshNewsBtn");
const moreNewsBtn = document.getElementById("moreNewsBtn");

const PAGE_SIZE = 10;
let loadedItems = [];   // toàn bộ tin lấy được từ nguồn hiện tại
let shownCount = 0;     // đang hiển thị bao nhiêu tin

// Đổ danh sách nguồn vào ô chọn, chia 2 nhóm cho dễ nhìn
(function buildSourceSelect() {
  const groups = { vn: "Báo Việt Nam", world: "Báo quốc tế" };
  for (const [key, label] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = label;
    Object.entries(NEWS_SOURCES)
      .filter(([, src]) => src.group === key)
      .forEach(([id, src]) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = src.label;
        og.appendChild(opt);
      });
    newsSelect.appendChild(og);
  }
})();

// RSS trả về đoạn tóm tắt dạng HTML (thường kèm 1 thẻ <img>). Tách riêng ảnh và chữ,
// và chỉ lấy phần chữ thuần — không chèn HTML lạ vào trang.
function parseSummary(descHtml) {
  const holder = document.createElement("div");
  holder.innerHTML = descHtml || "";
  const img = holder.querySelector("img");
  const thumb = img ? img.getAttribute("src") : null;
  if (img) img.remove();
  return { thumb, text: (holder.textContent || "").trim() };
}

function renderNewsItem(item, source) {
  const title = item.querySelector("title")?.textContent?.trim() || "(không có tiêu đề)";
  const link = item.querySelector("link")?.textContent?.trim() || source.site;
  const { thumb, text: summary } = parseSummary(item.querySelector("description")?.textContent);

  const row = document.createElement("button");
  row.className = "news-item";

  const titleEl = document.createElement("div");
  titleEl.textContent = title;
  row.appendChild(titleEl);

  if (thumb) {
    const img = document.createElement("img");
    img.className = "news-thumb";
    img.src = thumb;
    img.alt = "";
    row.appendChild(img);
  }

  const sumEl = document.createElement("div");
  sumEl.className = "news-summary";
  sumEl.textContent = summary || "(Bản tin này không kèm tóm tắt — mở bài đầy đủ để đọc.)";
  row.appendChild(sumEl);

  const openEl = document.createElement("span");
  openEl.className = "news-open-link";
  openEl.textContent = "Mở bài đầy đủ ↗";
  openEl.addEventListener("click", (ev) => {
    ev.stopPropagation();
    playClickSound();
    sendMessage("OPEN_BREAK_TAB", { url: link });
  });
  row.appendChild(openEl);

  row.addEventListener("click", () => {
    playClickSound();
    row.classList.toggle("open");
  });

  return row;
}

function showMoreNews() {
  const source = NEWS_SOURCES[newsSelect.value];
  const next = loadedItems.slice(shownCount, shownCount + PAGE_SIZE);
  next.forEach((item) => newsList.appendChild(renderNewsItem(item, source)));
  shownCount += next.length;
  moreNewsBtn.hidden = shownCount >= loadedItems.length;
}

async function loadNews(sourceKey) {
  const source = NEWS_SOURCES[sourceKey];
  newsList.innerHTML = `<p class="news-status">Đang tải tin từ ${source.label}…</p>`;
  moreNewsBtn.hidden = true;
  loadedItems = [];
  shownCount = 0;

  try {
    // Thêm tham số thời gian để trình duyệt không trả lại bản đã lưu đệm khi bấm Làm mới
    const url = source.rss + (source.rss.includes("?") ? "&" : "?") + "_t=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("Nội dung trả về không phải XML hợp lệ (có thể server chặn hoặc trả về trang HTML thay vì RSS)");
    loadedItems = [...doc.querySelectorAll("item")];
    if (loadedItems.length === 0) throw new Error("RSS tải được nhưng không có mục tin nào");

    newsList.innerHTML = "";
    showMoreNews();
  } catch (err) {
    console.error(`Focus Lock — lỗi tải RSS ${source.label} (${source.rss}):`, err);
    newsList.innerHTML =
      `<p class="news-status">Không tải được tin từ ${source.label}.<br />` +
      `Chi tiết: ${(err && err.message) || err}<br />` +
      `Mở thẳng: ${source.site}</p>`;
  }
}

newsSelect.addEventListener("change", () => {
  playClickSound();
  loadNews(newsSelect.value);
});

refreshNewsBtn.addEventListener("click", () => {
  playClickSound();
  loadNews(newsSelect.value);
});

moreNewsBtn.addEventListener("click", () => {
  playClickSound();
  showMoreNews();
});

newsSelect.value = "tuoitre";
loadNews("tuoitre");
