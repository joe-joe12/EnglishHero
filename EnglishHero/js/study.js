const { esc, jsArg, shuffle, wordKey, PLACEHOLDER, LEARNED } = EH;
const db = EH.db;
const $ = (id) => document.getElementById(id);

let currentUser = null;
let allWords = [];
let currentFolderForManagement = "";
let folderQuery = "";
let autoOpened = false;

// 翻牌學習狀態
let studyActive = false;
let studyState = { words: [], index: 0, flipped: false };
const settings = {
  reverse: EH.store.get("eh_reverse", false), // 先看中文
  auto: EH.store.get("eh_auto", false)        // 自動發音
};

const containerEl = $("flashcard-container");
const pageTitleEl = $("page-title");
const btnBackFolders = $("btn-back-folders");
const editModalContainer = $("edit-modal-container");

function setBack(show) { btnBackFolders.classList.toggle("hidden", !show); }
// 複習進度：第一次需要時才載入（只讀 1 次），離開背單字時上傳
let srsReady = null;
let srsCount = 0;
function ensureSrs() {
  if (!srsReady) srsReady = EH.srs.load(currentUser.uid);
  return srsReady;
}
window.addEventListener("pagehide", () => { if (srsReady) EH.srs.flush(); });

function leaveStudy() {
  studyActive = false;
  if (srsReady) EH.srs.flush();
}

// 本機資料有變動：同步寫回快取與統計
function persistLocal() {
  EH.cache.replaceAll(currentUser.uid, allWords);
  EH.saveStats(allWords);
}
function refreshAfterChange() {
  persistLocal();
  renderFolderList();
}

window.forceSync = async function () {
  EH.toast("同步中…", "info", 1200);
  try {
    await fetchAllWords(currentUser.uid, { force: true });
    EH.toast("✅ 已重新同步", "success", 1600);
  } catch (err) {
    EH.toast("同步失敗：" + err.message, "error", 4000);
  }
};

EH.requireUser((user) => {
  currentUser = user;
  fetchAllWords(user.uid);
});

// 單字來源是本機快取（只在有新增時才向 Firestore 補抓）；opts.force 會強制完整重讀
function fetchAllWords(uid, opts = {}) {
  return EH.cache.getWords(uid, opts)
    .then((words) => {
      allWords = words.map((w) => ({ ...w }));
      allWords.sort((a, b) => a.createdAt - b.createdAt);
      EH.saveStats(allWords);

      // 從首頁「繼續上次進度」帶 ?folder=xxx 進來時，直接開始背
      if (!autoOpened) {
        autoOpened = true;
        const wanted = new URLSearchParams(location.search).get("folder");
        if (wanted && allWords.some((w) => w.folder === wanted && w.en !== PLACEHOLDER)) {
          startStudy(wanted);
          return;
        }
      }
      if (pageTitleEl.textContent.startsWith("📁 我的單字資料夾")) renderFolderList();
    })
    .catch((err) => {
      console.error("載入失敗：", err);
      containerEl.innerHTML = `<p style="color:var(--danger); text-align:center;">載入單字失敗：${esc(err.message)}</p>`;
    });
}

/* ============================== 資料夾列表 ============================== */

function buildFolderData() {
  const folderMap = {};
  folderMap[LEARNED] = [];
  allWords.forEach((w) => {
    const f = w.folder || "未分類";
    if (!folderMap[f]) folderMap[f] = [];
    if (w.en !== PLACEHOLDER) folderMap[f].push(w);
  });

  const rootFoldersMap = {};
  const subFoldersMap = {};
  Object.keys(folderMap).forEach((f) => {
    if (f === LEARNED) return;
    if (f.includes("/")) {
      const parent = f.split("/")[0];
      if (!subFoldersMap[parent]) subFoldersMap[parent] = new Set();
      subFoldersMap[parent].add(f);
    } else {
      rootFoldersMap[f] = folderMap[f];
    }
  });
  return { folderMap, rootFoldersMap, subFoldersMap };
}

function wordRowHtml(w, withFolder) {
  return `
    <div class="word-row">
      <div class="word-main">
        <span class="word-en">${esc(w.en)}</span>
        ${w.pos ? `<span class="tag tag-pos">${esc(w.pos)}</span>` : ""}
        <span class="word-ch">${esc(w.ch)}</span>
      </div>
      <div class="word-actions">
        ${withFolder ? `<span class="tag">${esc(w.folder)}</span>` : ""}
        <button class="btn btn-ghost btn-sm" onclick="EH.speak(${jsArg(w.en)})">🔊</button>
      </div>
    </div>`;
}

function renderFolderList() {
  leaveStudy();
  pageTitleEl.textContent = "📁 我的單字資料夾";
  setBack(false);
  currentFolderForManagement = "";

  containerEl.innerHTML = `
    <div id="special-area"></div>
    <div class="section-bar">
      <span class="section-title">📚 您的題庫資料夾</span>
      <button class="btn btn-primary btn-sm" onclick="createNewEmptyFolder()">➕ 新增資料夾</button>
    </div>
    <input type="search" id="folder-search" class="search-input" placeholder="🔍 搜尋資料夾，或直接搜尋單字（英文 / 中文）…" value="${esc(folderQuery)}">
    <div id="folder-list-area"></div>
    <div class="import-bar">
      <button class="btn btn-accent" onclick="document.getElementById('import-file-input').click()">📥 匯入單字資料 (JSON)</button>
      <button class="btn btn-ghost" onclick="exportAllData()">💾 備份全部</button>
      <button class="btn btn-ghost" onclick="forceSync()">🔄 重新同步</button>
      <p class="muted" style="margin-top:10px;">單字會暫存在本機以節省流量；在別的裝置修改過資料後，按「重新同步」即可更新。</p>
      <input type="file" id="import-file-input" accept=".json" class="hidden" onchange="importData(event)">
    </div>`;

  $("folder-search").addEventListener("input", (e) => {
    folderQuery = e.target.value;
    renderFolderItems();
  });
  renderFolderItems();
}

function renderFolderItems() {
  const area = $("folder-list-area");
  const special = $("special-area");
  if (!area || !special) return;

  const q = folderQuery.trim().toLowerCase();
  const { folderMap, rootFoldersMap, subFoldersMap } = buildFolderData();

  const learnedCount = folderMap[LEARNED] ? folderMap[LEARNED].length : 0;
  special.innerHTML = `
    <div class="learned-card">
      <div class="folder-info" onclick="startStudy(${jsArg(LEARNED)})">
        <h3>${esc(LEARNED)}</h3>
        <p>共 ${learnedCount} 個字（點擊開始複習）</p>
      </div>
      <button class="dots-btn" onclick="toggleFolderDropdown(event, ${jsArg(LEARNED)}, 'special-learned')">⚙️ 管理</button>
    </div>`;

  let mains = Array.from(new Set([...Object.keys(rootFoldersMap), ...Object.keys(subFoldersMap)]))
    .sort((a, b) => a.localeCompare(b));
  if (q) {
    mains = mains.filter((m) =>
      m.toLowerCase().includes(q) ||
      Array.from(subFoldersMap[m] || []).some((s) => s.toLowerCase().includes(q)));
  }

  let html = "";
  if (mains.length === 0) {
    html += `<p class="muted" style="text-align:center; padding:14px;">${q ? "沒有符合的資料夾" : "目前沒有其他自訂資料夾"}</p>`;
  }

  mains.forEach((folderName, index) => {
    const hasSub = subFoldersMap[folderName] && subFoldersMap[folderName].size > 0;
    let totalCount = 0;
    if (rootFoldersMap[folderName]) totalCount += rootFoldersMap[folderName].length;
    if (hasSub) subFoldersMap[folderName].forEach((sub) => { totalCount += folderMap[sub].length; });

    const clickAction = hasSub ? `openSubFolderView(${jsArg(folderName)})` : `startStudy(${jsArg(folderName)})`;
    const subText = hasSub
      ? `包含 ${subFoldersMap[folderName].size} 個小資料夾（共 ${totalCount} 個單字）`
      : `共 ${totalCount} 個單字（點擊開始背單字）`;

    html += `
      <div class="folder-wrapper">
        <div class="folder-item" onclick="${clickAction}">
          <div class="folder-info">
            <h3>📁 ${esc(folderName)} ${hasSub ? '<span class="tag tag-accent">階層資料夾</span>' : ""}</h3>
            <p>${subText}</p>
          </div>
          <div onclick="event.stopPropagation()">
            <button class="dots-btn" id="dots-btn-${index}" onclick="toggleFolderDropdown(event, ${jsArg(folderName)}, ${jsArg(String(index))})">⚙️</button>
          </div>
        </div>
      </div>`;
  });

  // 全庫單字搜尋
  if (q) {
    const matches = allWords.filter((w) =>
      w.en !== PLACEHOLDER && (w.en.toLowerCase().includes(q) || w.ch.toLowerCase().includes(q)));
    html += `<div class="section-bar"><span class="section-title">🔎 單字搜尋結果（${matches.length}）</span></div>`;
    html += `<div class="word-list">${matches.slice(0, 30).map((w) => wordRowHtml(w, true)).join("")}</div>`;
    if (matches.length > 30) html += `<p class="muted" style="text-align:center; margin-top:8px;">只顯示前 30 筆，請輸入更精確的關鍵字</p>`;
  }

  area.innerHTML = html;
}

window.createNewEmptyFolder = async function () {
  const name = await EH.prompt("請輸入新資料夾名稱：");
  if (!name || !name.trim()) return;
  const cleanName = name.trim();

  if (allWords.some((w) => w.folder === cleanName || w.folder.startsWith(`${cleanName}/`))) {
    EH.toast("此資料夾名稱已存在！", "error");
    return;
  }

  try {
    const newRef = await db.collection("users").doc(currentUser.uid).collection("words").add({
      en: PLACEHOLDER,
      pos: "",
      ch: "（空白資料夾佔位用）",
      folder: cleanName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    allWords.push({ id: newRef.id, en: PLACEHOLDER, pos: "", ch: "（空白資料夾佔位用）", folder: cleanName, createdAt: Date.now() });
    EH.toast(`📁 已建立資料夾「${cleanName}」`, "success");
    refreshAfterChange();
  } catch (err) {
    EH.toast("建立失敗：" + err.message, "error", 4000);
  }
};

window.openSubFolderView = function (parentFolderName) {
  leaveStudy();
  pageTitleEl.textContent = `📁 ${parentFolderName}`;
  setBack(true);

  const subFolders = Array.from(new Set(allWords.map((w) => w.folder)))
    .filter((f) => f.startsWith(`${parentFolderName}/`))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let html = `<p class="muted" style="margin-bottom:12px;">點擊小資料夾即可開始背單字，或按右側 ⚙️ 管理：</p>`;
  subFolders.forEach((full, index) => {
    const subName = full.slice(parentFolderName.length + 1);
    const count = allWords.filter((w) => w.folder === full && w.en !== PLACEHOLDER).length;
    html += `
      <div class="folder-wrapper">
        <div class="folder-item" onclick="startStudy(${jsArg(full)})">
          <div class="folder-info">
            <h3>📂 ${esc(subName)}</h3>
            <p>共 ${count} 個單字</p>
          </div>
          <div onclick="event.stopPropagation()">
            <button class="dots-btn" id="sub-dots-${index}" onclick="toggleFolderDropdown(event, ${jsArg(full)}, ${jsArg("sub-" + index)})">⚙️</button>
          </div>
        </div>
      </div>`;
  });
  containerEl.innerHTML = html;
};

/* ============================== 資料夾操作 ============================== */

window.copyToTargetFolder = async function (sourceFolderName) {
  const targetWords = allWords.filter((w) =>
    (w.folder === sourceFolderName || w.folder.startsWith(`${sourceFolderName}/`)) && w.en !== PLACEHOLDER);
  if (targetWords.length === 0) {
    EH.toast("這個資料夾中沒有任何單字可以複製！", "error");
    return;
  }

  const existing = Array.from(new Set(allWords.map((w) => (w.folder.includes("/") ? w.folder.split("/")[0] : w.folder))))
    .filter((f) => f !== sourceFolderName && f !== LEARNED);
  let msg = `請輸入要將「${sourceFolderName}」的 ${targetWords.length} 個單字複製到哪一個資料夾？`;
  if (existing.length) msg += `\n現有資料夾：${existing.join("、")}`;

  const dest = await EH.prompt(msg);
  if (!dest || !dest.trim()) return;
  const cleanDest = dest.trim();

  if (!(await EH.confirm(`確定要複製一份到「${cleanDest}」嗎？（原本的單字會保留）`))) return;

  try {
    const ref = db.collection("users").doc(currentUser.uid).collection("words");
    const created = [];
    for (let i = 0; i < targetWords.length; i += 400) {
      const batch = db.batch();
      targetWords.slice(i, i + 400).forEach((w) => {
        const r = ref.doc();
        created.push({ id: r.id, en: w.en, pos: w.pos || "", ch: w.ch, folder: cleanDest, createdAt: Date.now() });
        batch.set(r, {
          en: w.en, pos: w.pos || "", ch: w.ch, folder: cleanDest,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
    allWords.push(...created);
    EH.toast(`🎉 已複製 ${targetWords.length} 個單字到「${cleanDest}」`, "success");
    refreshAfterChange();
  } catch (err) {
    EH.toast("複製失敗：" + err.message, "error", 4000);
  }
};

window.viewFolderWords = function (folderName) {
  leaveStudy();
  const targetWords = allWords.filter((w) =>
    (w.folder === folderName || w.folder.startsWith(`${folderName}/`)) && w.en !== PLACEHOLDER);

  pageTitleEl.textContent = `📖 檢視單字：${folderName}`;
  setBack(true);

  if (targetWords.length === 0) {
    containerEl.innerHTML = `<p class="muted" style="text-align:center; padding:30px;">這個資料夾中沒有任何單字。</p>`;
    return;
  }

  containerEl.innerHTML = `
    <input type="search" id="view-search" class="search-input" placeholder="🔍 搜尋這個資料夾的單字…">
    <p class="muted" id="view-count" style="margin-bottom:8px;"></p>
    <div class="word-list" id="view-list"></div>`;

  const draw = (q) => {
    const k = q.trim().toLowerCase();
    const list = k ? targetWords.filter((w) => w.en.toLowerCase().includes(k) || w.ch.toLowerCase().includes(k)) : targetWords;
    $("view-count").textContent = `共 ${list.length} 個單字`;
    $("view-list").innerHTML = list.map((w) => wordRowHtml(w, w.folder !== folderName)).join("");
  };
  $("view-search").addEventListener("input", (e) => draw(e.target.value));
  draw("");
};

window.exportFolderData = function (folderName) {
  const targetWords = allWords.filter((w) =>
    (w.folder === folderName || w.folder.startsWith(`${folderName}/`)) && w.en !== PLACEHOLDER);
  if (targetWords.length === 0) {
    EH.toast("這個資料夾沒有單字可以匯出！", "error");
    return;
  }

  const data = targetWords.map((w) => ({ en: w.en, pos: w.pos, ch: w.ch, folder: w.folder }));
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  const a = document.createElement("a");
  a.setAttribute("href", dataStr);
  a.setAttribute("download", `english_hero_${folderName.replace(/\//g, "_")}_backup.json`);
  document.body.appendChild(a);
  a.click();
  a.remove();
  EH.toast(`📤 已匯出 ${data.length} 個單字`, "success");
};

// 備份整個單字庫（格式和「匯入單字資料」相同，之後可直接匯入還原）
window.exportAllData = function () {
  const list = allWords.filter((w) => w.en !== PLACEHOLDER)
    .map((w) => ({ en: w.en, pos: w.pos, ch: w.ch, folder: w.folder }));
  if (list.length === 0) {
    EH.toast("單字庫是空的，沒有東西可以備份", "error");
    return;
  }
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.setAttribute("href", "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(list, null, 2)));
  a.setAttribute("download", `english_hero_全部備份_${stamp}.json`);
  document.body.appendChild(a);
  a.click();
  a.remove();
  EH.toast(`💾 已備份 ${list.length} 個單字`, "success");
};

// 清除同一資料夾內「英文與中文都相同」的重複單字（保留最早的一筆）
window.dedupeFolder = async function (folderName) {
  const targets = allWords.filter((w) =>
    (w.folder === folderName || w.folder.startsWith(`${folderName}/`)) && w.en !== PLACEHOLDER);
  const seen = new Set();
  const dups = [];
  targets.forEach((w) => {
    const k = w.folder + "|" + wordKey(w);
    if (seen.has(k)) dups.push(w);
    else seen.add(k);
  });

  if (dups.length === 0) {
    EH.toast("這個資料夾沒有重複的單字 👍", "info");
    return;
  }
  if (!(await EH.confirm(`找到 ${dups.length} 個重複的單字（同一個資料夾內，英文與中文都相同），要刪除多出來的嗎？\n每組會保留最早加入的那一筆。`, { danger: true, okText: "刪除重複" }))) return;

  try {
    const ref = db.collection("users").doc(currentUser.uid).collection("words");
    for (let i = 0; i < dups.length; i += 400) {
      const batch = db.batch();
      dups.slice(i, i + 400).forEach((w) => batch.delete(ref.doc(w.id)));
      await batch.commit();
    }
    const ids = new Set(dups.map((w) => w.id));
    allWords = allWords.filter((w) => !ids.has(w.id));
    EH.toast(`🧹 已清除 ${dups.length} 個重複單字`, "success");
    refreshAfterChange();
  } catch (err) {
    EH.toast("清除失敗：" + err.message, "error", 4000);
  }
};

window.importData = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) {
        EH.toast("檔案格式錯誤！", "error");
        return;
      }
      if (!(await EH.confirm(`確定要匯入這 ${imported.length} 個單字嗎？`))) {
        event.target.value = "";
        return;
      }

      const ref = db.collection("users").doc(currentUser.uid).collection("words");
      const created = [];
      for (let i = 0; i < imported.length; i += 400) {
        const batch = db.batch();
        imported.slice(i, i + 400).forEach((w) => {
          if (w.en && w.ch) {
            const r = ref.doc();
            created.push({ id: r.id, en: w.en, pos: w.pos || "", ch: w.ch, folder: w.folder || "匯入分類", createdAt: Date.now() });
            batch.set(r, {
              en: w.en, pos: w.pos || "", ch: w.ch, folder: w.folder || "匯入分類",
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        });
        await batch.commit();
      }
      allWords.push(...created);
      EH.toast(`資料匯入成功！共 ${created.length} 個單字`, "success");
      event.target.value = "";
      refreshAfterChange();
    } catch (err) {
      EH.toast("解析或匯入失敗：" + err.message, "error", 4000);
    }
  };
  reader.readAsText(file);
};

window.addAllToLearned = async function (folderName) {
  const targetWords = allWords.filter((w) =>
    (w.folder === folderName || w.folder.startsWith(`${folderName}/`)) && w.en !== PLACEHOLDER);
  if (targetWords.length === 0) {
    EH.toast("這個資料夾中沒有任何單字！", "error");
    return;
  }

  const learnedKeys = new Set(allWords.filter((w) => w.folder === LEARNED).map(wordKey));
  const toAdd = [];
  targetWords.forEach((w) => {
    const k = wordKey(w);
    if (!learnedKeys.has(k)) { learnedKeys.add(k); toAdd.push(w); }
  });
  if (toAdd.length === 0) {
    EH.toast("這些單字都已經在「已經背過」裡了！", "info");
    return;
  }

  if (!(await EH.confirm(`確定要將「${folderName}」中的 ${toAdd.length} 個單字加入「${LEARNED}」嗎？\n（已存在的單字會自動略過）`))) return;

  try {
    const ref = db.collection("users").doc(currentUser.uid).collection("words");
    const created = [];
    for (let i = 0; i < toAdd.length; i += 400) {
      const batch = db.batch();
      toAdd.slice(i, i + 400).forEach((w) => {
        const r = ref.doc();
        created.push({ id: r.id, en: w.en, pos: w.pos || "", ch: w.ch, folder: LEARNED, createdAt: Date.now() });
        batch.set(r, {
          en: w.en, pos: w.pos || "", ch: w.ch, folder: LEARNED,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
    allWords.push(...created);
    EH.toast(`🎉 已將 ${toAdd.length} 個單字加入「已經背過」`, "success");
    refreshAfterChange();
  } catch (err) {
    EH.toast("操作失敗：" + err.message, "error", 4000);
  }
};

// 拆分資料夾：分批寫入，避免超過 Firestore 單一 batch 500 筆上限
window.splitFolder = async function (folderName) {
  const targetWords = allWords.filter((w) => w.folder === folderName && w.en !== PLACEHOLDER);
  if (targetWords.length === 0) {
    EH.toast("這個資料夾沒有單字可以拆分！", "error");
    return;
  }

  const input = await EH.prompt(`請輸入每個小資料夾要包含幾個單字？（目前總共有 ${targetWords.length} 個單字）`, "10");
  if (!input) return;
  const size = parseInt(input, 10);
  if (isNaN(size) || size <= 0) {
    EH.toast("請輸入有效的數字！", "error");
    return;
  }
  if (!(await EH.confirm(`確定要將「${folderName}」以每 ${size} 個單字為一組，拆分為階層式小資料夾嗎？`))) return;

  const ref = db.collection("users").doc(currentUser.uid).collection("words");
  const newFolders = new Map();
  try {
    for (let i = 0; i < targetWords.length; i += 400) {
      const batch = db.batch();
      targetWords.slice(i, i + 400).forEach((w, j) => {
        const part = Math.floor((i + j) / size) + 1;
        const nf = `${folderName}/Part${part}`;
        newFolders.set(w.id, nf);
        batch.update(ref.doc(w.id), { folder: nf });
      });
      await batch.commit();
    }
    allWords.forEach((w) => { if (newFolders.has(w.id)) w.folder = newFolders.get(w.id); });
    EH.toast(`🎉 已拆分為 ${Math.ceil(targetWords.length / size)} 個小資料夾`, "success");
    refreshAfterChange();
  } catch (err) {
    EH.toast("拆分失敗：" + err.message, "error", 4000);
  }
};

/* ============================== 下拉選單 ============================== */

window.toggleFolderDropdown = function (event, folderName, index) {
  event.stopPropagation();

  // 已經開著就關掉
  if ($("global-dropdown-menu")) { closeGlobalDropdown(); return; }

  let btn;
  if (index === "special-learned") btn = event.currentTarget;
  else if (String(index).startsWith("sub-")) btn = $(`sub-dots-${index.replace("sub-", "")}`);
  else btn = $(`dots-btn-${index}`);
  if (!btn) return;

  // 手機（窄螢幕）：從畫面底部滑出，一定看得到所有選項；桌機：貼在按鈕旁
  const isSheet = window.innerWidth <= 640;

  const f = jsArg(folderName);
  const isLearned = folderName === LEARNED;
  const item = (cls, fn, label) =>
    `<button class="dropdown-item ${cls}" onclick="${fn}(${f}); closeGlobalDropdown();">${label}</button>`;

  const menu = document.createElement("div");
  menu.id = "global-dropdown-menu";
  menu.className = "dropdown-menu" + (isSheet ? " sheet" : "");
  menu.innerHTML =
    (isSheet ? `<div class="sheet-title">${esc(folderName)}</div>` : "") + [
      item("is-info", "viewFolderWords", "📖 檢視單字"),
      item("", "openFolderEditModal", "✏️ 管理單字"),
      !isLearned ? item("is-warn", "copyToTargetFolder", "📁 複製至…資料夾") : "",
      !isLearned ? item("is-success", "addAllToLearned", "✅ 整夾加入已背過") : "",
      !isLearned && !folderName.includes("/") ? item("is-accent", "splitFolder", "📦 拆分為多個子資料夾") : "",
      item("is-warn", "dedupeFolder", "🧹 清除重複單字"),
      item("is-success", "exportFolderData", "📤 匯出此資料夾"),
      item("is-danger", "confirmDeleteFolder", isLearned ? "🗑️ 清空已背過單字" : "🗑️ 刪除資料夾")
    ].join("");

  if (isSheet) {
    const backdrop = document.createElement("div");
    backdrop.id = "global-dropdown-backdrop";
    backdrop.className = "sheet-backdrop";
    document.body.appendChild(backdrop);
    document.body.appendChild(menu);
    return;
  }

  // 桌機：先放到按鈕下方，再依空間決定往下或往上
  const rect = btn.getBoundingClientRect();
  const margin = 8;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.maxHeight = Math.min(360, window.innerHeight - margin * 2) + "px";
  document.body.appendChild(menu);

  const h = menu.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  if (h <= spaceBelow) menu.style.top = `${rect.bottom + 4}px`;
  else if (h <= spaceAbove) menu.style.top = `${rect.top - h - 4}px`;
  else menu.style.top = `${margin}px`;
};

window.closeGlobalDropdown = function () {
  const menu = $("global-dropdown-menu");
  if (menu) menu.remove();
  const backdrop = $("global-dropdown-backdrop");
  if (backdrop) backdrop.remove();
};
// 點任何地方（包含背景）都會關閉；手機網址列伸縮會觸發 scroll/resize，所以不再用它們關閉
document.addEventListener("click", closeGlobalDropdown);

/* ============================== 翻牌學習 ============================== */

window.startStudy = function (folderName) {
  currentFolderForManagement = folderName;
  EH.store.set("eh_last_study", folderName);
  pageTitleEl.textContent = `🎯 背單字：${folderName}`;
  setBack(true);

  studyState = {
    words: allWords.filter((w) => w.folder === folderName && w.en !== PLACEHOLDER),
    index: 0,
    flipped: false
  };
  renderStudyShell();
};

function renderStudyShell() {
  const s = studyState;
  if (s.words.length === 0) {
    studyActive = false;
    containerEl.innerHTML = `
      <div class="done-box">
        <div class="big">📭</div>
        <p>這個資料夾目前沒有任何單字。</p>
        <button class="btn btn-primary" style="margin-top:14px" onclick="renderFolderList()">返回資料夾列表</button>
      </div>`;
    return;
  }

  const learnedBtn = currentFolderForManagement === LEARNED
    ? ""
    : `<button class="btn btn-success btn-sm" onclick="markAsLearned()">✅ 我已經會了</button>`;

  containerEl.innerHTML = `
    <div class="progress"><span id="study-progress"></span></div>
    <div class="study-meta">
      <span id="study-count"></span>
      <span class="tag tag-accent">${esc(currentFolderForManagement)}</span>
    </div>

    <div class="flip-scene" id="flip-scene">
      <div class="flip-card" id="flip-card" onclick="flipCard()">
        <div class="flip-face flip-front">
          <span class="tag tag-pos" id="front-pos"></span>
          <div class="face-word" id="front-main"></div>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); speakCurrent()">🔊 唸</button>
          <div class="face-hint">點擊卡片或按空白鍵翻面</div>
        </div>
        <div class="flip-face flip-back">
          <span class="tag tag-pos" id="back-pos"></span>
          <div class="face-word" id="back-main"></div>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); speakCurrent()">🔊 唸</button>
        </div>
      </div>
    </div>

    <div class="study-controls">
      <button class="btn btn-secondary" onclick="prevCard()">⬅️ 上一張</button>
      <button class="btn btn-primary" onclick="flipCard()">🔄 翻面</button>
      <button class="btn btn-secondary" onclick="nextCard()">下一張 ➡️</button>
    </div>

    <div class="study-judge hidden" id="study-judge">
      <button class="btn btn-danger" onclick="judgeCard(false)">❌ 不記得 <span class="kbd">1</span></button>
      <button class="btn btn-primary" onclick="judgeCard(true)">✅ 記得 <span class="kbd">2</span></button>
    </div>

    <div class="study-tools">
      <button class="btn btn-ghost btn-sm" onclick="shuffleStudy()">🔀 隨機排序</button>
      <button class="btn btn-ghost btn-sm" id="tool-reverse" onclick="toggleSetting('reverse')">🔁 先看中文</button>
      <button class="btn btn-ghost btn-sm" id="tool-auto" onclick="toggleSetting('auto')">🔈 自動唸</button>
      ${learnedBtn}
    </div>

    <div class="kbd-hint">
      <span class="kbd">←</span> <span class="kbd">→</span> 換卡　
      <span class="kbd">空白</span> 翻面　
      <span class="kbd">S</span> 發音　
      <span class="kbd">L</span> 已會
    </div>`;

  // 手機左右滑動換卡
  const scene = $("flip-scene");
  let x0 = null;
  scene.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  scene.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 60) (dx < 0 ? nextCard : prevCard)();
  });

  studyActive = true;
  refreshToolButtons();
  updateCard();
}

function refreshToolButtons() {
  const r = $("tool-reverse");
  const a = $("tool-auto");
  if (r) r.classList.toggle("is-on", settings.reverse);
  if (a) a.classList.toggle("is-on", settings.auto);
}

function updateCard() {
  const s = studyState;
  const w = s.words[s.index];
  if (!w) return;
  const total = s.words.length;

  $("study-count").textContent = `${s.index + 1} / ${total}`;
  $("study-progress").style.width = `${((s.index + 1) / total) * 100}%`;

  const frontMain = settings.reverse ? w.ch : w.en;
  const backMain = settings.reverse ? w.en : w.ch;
  $("front-main").textContent = frontMain;
  $("back-main").textContent = backMain;

  ["front-pos", "back-pos"].forEach((id) => {
    const el = $(id);
    el.textContent = w.pos || "";
    el.classList.toggle("hidden", !w.pos);
  });

  s.flipped = false;
  $("flip-card").classList.remove("is-flipped");
  $("study-judge").classList.add("hidden");

  if (settings.auto && !settings.reverse) EH.speak(w.en);
}

// 已翻面時，先翻回正面再換內容，避免答案在翻轉動畫中露餡
function swapCard(applyFn) {
  const s = studyState;
  const card = $("flip-card");
  if (s.flipped && card) {
    card.classList.remove("is-flipped");
    s.flipped = false;
    $("study-judge").classList.add("hidden");
    setTimeout(applyFn, 170);
  } else {
    applyFn();
  }
}

window.flipCard = function () {
  const s = studyState;
  const card = $("flip-card");
  if (!card) return;
  s.flipped = !s.flipped;
  card.classList.toggle("is-flipped", s.flipped);
  $("study-judge").classList.toggle("hidden", !s.flipped);
  if (settings.auto && settings.reverse && s.flipped) speakCurrent();
};

window.prevCard = function () {
  const s = studyState;
  if (!s.words.length) return;
  const next = (s.index - 1 + s.words.length) % s.words.length;
  swapCard(() => { s.index = next; updateCard(); });
};

window.nextCard = function () {
  const s = studyState;
  if (!s.words.length) return;
  const next = (s.index + 1) % s.words.length;
  swapCard(() => { s.index = next; updateCard(); });
};

// 翻面看答案後，告訴系統自己記不記得 → 記錄間隔複習進度，並換下一張
window.judgeCard = async function (ok) {
  const s = studyState;
  const w = s.words[s.index];
  if (!w) return;
  await ensureSrs();
  EH.srs.record(w, ok);
  srsCount++;
  if (srsCount % 10 === 0) EH.srs.flush();
  EH.toast(ok ? "✅ 記下來了" : "❌ 明天會再出現", ok ? "success" : "info", 1200);
  nextCard();
};

window.speakCurrent = function () {
  const w = studyState.words[studyState.index];
  if (w) EH.speak(w.en);
};

window.shuffleStudy = function () {
  studyState.words = shuffle(studyState.words);
  studyState.index = 0;
  updateCard();
  EH.toast("🔀 已隨機排序", "info", 1500);
};

window.toggleSetting = function (name) {
  settings[name] = !settings[name];
  EH.store.set("eh_" + name, settings[name]);
  refreshToolButtons();
  if (name === "reverse") updateCard();
};

function renderStudyDone() {
  studyActive = false;
  containerEl.innerHTML = `
    <div class="done-box">
      <div class="big">🎉</div>
      <h3>這個資料夾都背完了！</h3>
      <p class="muted" style="margin-top:6px;">去測驗看看記得多少吧</p>
      <div class="result-actions">
        <a class="btn btn-primary" href="quiz.html?v=3000">✏️ 去考單字</a>
        <button class="btn btn-ghost" onclick="renderFolderList()">返回列表</button>
      </div>
    </div>`;
}

window.markAsLearned = async function () {
  const s = studyState;
  const word = s.words[s.index];
  if (!word) return;

  try {
    const exists = allWords.some((w) => w.folder === LEARNED && wordKey(w) === wordKey(word));
    if (!exists) {
      const ref = await db.collection("users").doc(currentUser.uid).collection("words").add({
        en: word.en, pos: word.pos || "", ch: word.ch, folder: LEARNED,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      allWords.push({ id: ref.id, en: word.en, pos: word.pos || "", ch: word.ch, folder: LEARNED, createdAt: Date.now() });
      EH.toast(`✅ 「${word.en}」已加入已經背過`, "success", 1600);
    } else {
      EH.toast(`「${word.en}」已經在已經背過裡了`, "info", 1600);
    }
    persistLocal();

    s.words.splice(s.index, 1);
    if (s.words.length === 0) { renderStudyDone(); return; }
    swapCard(() => {
      if (s.index >= s.words.length) s.index = 0;
      updateCard();
    });
  } catch (err) {
    EH.toast("操作失敗：" + err.message, "error", 4000);
  }
};

// 鍵盤快捷鍵
document.addEventListener("keydown", (e) => {
  if (!studyActive || EH.modalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag)) return;
  const onButton = tag === "button";

  switch (e.key) {
    case "ArrowLeft": e.preventDefault(); prevCard(); break;
    case "ArrowRight": e.preventDefault(); nextCard(); break;
    case " ":
    case "Enter":
      if (onButton) return; // 避免和按鈕本身的點擊重複觸發
      e.preventDefault();
      flipCard();
      break;
    case "s": case "S": speakCurrent(); break;
    case "1": if (studyState.flipped) judgeCard(false); break;
    case "2": if (studyState.flipped) judgeCard(true); break;
    case "l": case "L":
      if (currentFolderForManagement !== LEARNED) markAsLearned();
      break;
  }
});

btnBackFolders.addEventListener("click", () => renderFolderList());

/* ============================== 管理 / 編輯 ============================== */

window.openFolderEditModal = function (folderName) {
  leaveStudy();
  currentFolderForManagement = folderName;
  const targetWords = allWords.filter((w) => w.folder === folderName && w.en !== PLACEHOLDER);

  pageTitleEl.textContent = `✏️ 管理資料夾：${folderName}`;
  setBack(true);

  if (targetWords.length === 0) {
    containerEl.innerHTML = `<p class="muted" style="text-align:center; padding:30px;">這個資料夾裡沒有直接的單字（可能包含子資料夾）。</p>`;
    return;
  }

  let html = `<input type="search" id="manage-search" class="search-input" placeholder="🔍 搜尋這個資料夾的單字…"><div class="word-list" id="manage-list"></div>`;
  containerEl.innerHTML = html;

  const draw = (q) => {
    const k = q.trim().toLowerCase();
    const list = k ? targetWords.filter((w) => w.en.toLowerCase().includes(k) || w.ch.toLowerCase().includes(k)) : targetWords;
    $("manage-list").innerHTML = list.map((w) => `
      <div class="word-row">
        <div class="word-main">
          <span class="word-en">${esc(w.en)}</span>
          ${w.pos ? `<span class="tag tag-pos">${esc(w.pos)}</span>` : ""}
          <span class="word-ch">${esc(w.ch)}</span>
        </div>
        <div class="word-actions">
          <button class="btn btn-ghost btn-sm" onclick="openSingleEditModal(${jsArg(w.id)})">修改</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteSingleWord(${jsArg(w.id)})">刪除</button>
        </div>
      </div>`).join("") || `<p class="muted" style="text-align:center;">沒有符合的單字</p>`;
  };
  $("manage-search").addEventListener("input", (e) => draw(e.target.value));
  draw("");
};

window.openSingleEditModal = function (wordId) {
  const target = allWords.find((w) => w.id === wordId);
  if (!target) return;
  const known = ["n.", "v.", "adj.", "adv.", "prep.", "conj.", "phr."];
  const opts = [
    ["n.", "n. (名詞)"], ["v.", "v. (動詞)"], ["adj.", "adj. (形容詞)"], ["adv.", "adv. (副詞)"],
    ["prep.", "prep. (介系詞)"], ["conj.", "conj. (連接詞)"], ["phr.", "phr. (片語)"], ["", "(無/其他)"]
  ].map(([v, label]) => {
    const selected = v === "" ? !known.includes(target.pos) : target.pos === v;
    return `<option value="${v}" ${selected ? "selected" : ""}>${label}</option>`;
  }).join("");

  const submit = `if(event.key==='Enter'){saveEditedWord(${jsArg(target.id)})}`;
  editModalContainer.innerHTML = `
    <div class="eh-modal-backdrop" onclick="if(event.target===this) closeEditModal()">
      <div class="eh-modal">
        <h3>✏️ 修改單字資料</h3>
        <div class="form-group">
          <label>英文單字 (English)</label>
          <input type="text" id="edit-en" value="${esc(target.en)}" onkeydown="${submit}">
        </div>
        <div class="form-group">
          <label>詞性 (Part of Speech)</label>
          <select id="edit-pos">${opts}</select>
        </div>
        <div class="form-group">
          <label>中文意思 (Chinese)</label>
          <input type="text" id="edit-ch" value="${esc(target.ch)}" onkeydown="${submit}">
        </div>
        <div class="modal-btns">
          <button class="btn btn-ghost" onclick="closeEditModal()">取消</button>
          <button class="btn btn-primary" onclick="saveEditedWord(${jsArg(target.id)})">儲存修改</button>
        </div>
      </div>
    </div>`;
  $("edit-en").focus();
};

window.closeEditModal = function () { editModalContainer.innerHTML = ""; };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editModalContainer.firstChild) closeEditModal();
});

window.saveEditedWord = function (wordId) {
  const newEn = $("edit-en").value.trim();
  const newPos = $("edit-pos").value;
  const newCh = $("edit-ch").value.trim();
  if (!newEn || !newCh) {
    EH.toast("英文與中文不能為空！", "error");
    return;
  }

  db.collection("users").doc(currentUser.uid).collection("words").doc(wordId)
    .update({ en: newEn, pos: newPos, ch: newCh })
    .then(() => {
      const t = allWords.find((w) => w.id === wordId);
      const oldW = t ? { en: t.en, ch: t.ch } : null;
      if (t) { t.en = newEn; t.pos = newPos; t.ch = newCh; }
      if (oldW && (oldW.en !== newEn || oldW.ch !== newCh)) {
        ensureSrs().then(() => { EH.srs.rename(oldW, { en: newEn, ch: newCh }); EH.srs.flush(); });
      }
      persistLocal();
      closeEditModal();
      openFolderEditModal(currentFolderForManagement);
      EH.toast("✅ 已儲存修改", "success", 1500);
    })
    .catch((err) => EH.toast("修改失敗：" + err.message, "error", 4000));
};

window.deleteSingleWord = async function (wordId) {
  if (!(await EH.confirm("確定要刪除這個單字嗎？", { danger: true, okText: "刪除" }))) return;
  try {
    await db.collection("users").doc(currentUser.uid).collection("words").doc(wordId).delete();
    allWords = allWords.filter((w) => w.id !== wordId);
    persistLocal();
    openFolderEditModal(currentFolderForManagement);
    EH.toast("🗑️ 已刪除", "success", 1500);
  } catch (err) {
    EH.toast("刪除失敗：" + err.message, "error", 4000);
  }
};

window.confirmDeleteFolder = async function (folderName) {
  let msg;
  if (folderName === LEARNED) msg = `確定要清空「${LEARNED}」裡的所有單字嗎？`;
  else if (folderName.includes("/")) msg = `確定要刪除小資料夾「${folderName}」以及裡面的所有單字嗎？`;
  else msg = `確定要刪除大資料夾「${folderName}」以及底下所有的子資料夾與單字嗎？`;
  if (await EH.confirm(msg, { danger: true, okText: "刪除" })) deleteFolder(folderName);
};

window.deleteFolder = function (folderName) {
  const targetWords = allWords.filter((w) => w.folder === folderName || w.folder.startsWith(`${folderName}/`));
  if (targetWords.length === 0) return;

  const ref = db.collection("users").doc(currentUser.uid).collection("words");
  const jobs = [];
  for (let i = 0; i < targetWords.length; i += 400) {
    const batch = db.batch();
    targetWords.slice(i, i + 400).forEach((w) => batch.delete(ref.doc(w.id)));
    jobs.push(batch.commit());
  }

  Promise.all(jobs)
    .then(() => {
      EH.toast(`🗑️ 已刪除資料夾「${folderName}」`, "success");
      allWords = allWords.filter((w) => w.folder !== folderName && !w.folder.startsWith(`${folderName}/`));
      persistLocal();
      renderFolderList();
    })
    .catch((err) => EH.toast("刪除資料夾失敗：" + err.message, "error", 4000));
};
