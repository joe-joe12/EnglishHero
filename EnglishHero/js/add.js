const db = EH.db;
let currentUser = null;

const folderSelect = document.getElementById("folder-select");
const newFolderGroup = document.getElementById("new-folder-group");
const newFolderInput = document.getElementById("new-folder-input");
const btnToggleNewFolder = document.getElementById("btn-toggle-new-folder");
const btnCancelNewFolder = document.getElementById("btn-cancel-new-folder");
const addForm = document.getElementById("add-word-form");
const bulkForm = document.getElementById("bulk-form");
const bulkText = document.getElementById("bulk-text");
const bulkPreview = document.getElementById("bulk-preview");
const bulkSubmit = document.getElementById("bulk-submit");
const tabSingle = document.getElementById("tab-single");
const tabBulk = document.getElementById("tab-bulk");
const btnAutoTranslate = document.getElementById("btn-auto-translate");
const enInput = document.getElementById("word-en");
const chInput = document.getElementById("word-ch");
const posSelect = document.getElementById("word-pos");

// 每個資料夾已存在的單字（用來提醒重複）
let existingKeys = new Set();
const dupKey = (folder, en) => `${folder}|${en.trim().toLowerCase()}`;

// 內建常用單字快查庫（可自行新增）
const localDictionary = {
  "apple": { ch: "蘋果", pos: "n." },
  "banana": { ch: "香蕉", pos: "n." },
  "book": { ch: "書本", pos: "n." },
  "cat": { ch: "貓", pos: "n." },
  "dog": { ch: "狗", pos: "n." },
  "car": { ch: "汽車", pos: "n." },
  "computer": { ch: "電腦", pos: "n." },
  "phone": { ch: "手機", pos: "n." },
  "water": { ch: "水", pos: "n." },
  "food": { ch: "食物", pos: "n." },
  "run": { ch: "跑步", pos: "v." },
  "eat": { ch: "吃", pos: "v." },
  "drink": { ch: "喝", pos: "v." },
  "read": { ch: "閱讀", pos: "v." },
  "write": { ch: "寫字", pos: "v." },
  "study": { ch: "讀書 / 學習", pos: "v." },
  "learn": { ch: "學習", pos: "v." },
  "happy": { ch: "快樂的", pos: "adj." },
  "sad": { ch: "傷心的", pos: "adj." },
  "big": { ch: "大的", pos: "adj." },
  "small": { ch: "小的", pos: "adj." },
  "fast": { ch: "快的", pos: "adj." },
  "slow": { ch: "慢的", pos: "adj." },
  "good": { ch: "好的", pos: "adj." },
  "bad": { ch: "壞的", pos: "adj." },
  "quickly": { ch: "快速地", pos: "adv." },
  "slowly": { ch: "緩慢地", pos: "adv." }
};

EH.requireUser((user) => {
  currentUser = user;
  loadUserFolders(user.uid);
});

// 讀取現有資料夾與已存在的單字
// localOnly=true：只用本機快取，不連線（剛存完單字後使用）
function loadUserFolders(uid, selectFolder, localOnly) {
  const cached = localOnly ? EH.cache.peek(uid) : null;
  return (cached ? Promise.resolve(cached) : EH.cache.getWords(uid))
    .then((words) => {
      const foldersSet = new Set();
      existingKeys = new Set();
      words.forEach((d) => {
        if (d.folder) foldersSet.add(d.folder);
        if (d.folder && d.en && d.en !== EH.PLACEHOLDER) existingKeys.add(dupKey(d.folder, d.en));
      });

      folderSelect.innerHTML = "";
      if (foldersSet.size === 0) {
        folderSelect.innerHTML = `<option value="預設分類">預設分類</option>`;
      } else {
        Array.from(foldersSet).sort((a, b) => a.localeCompare(b)).forEach((name) => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          folderSelect.appendChild(opt);
        });
        const last = selectFolder || EH.store.get("eh_last_add_folder");
        if (last && foldersSet.has(last)) folderSelect.value = last;
      }
      updateBulkPreview();
    })
    .catch((err) => {
      console.error("載入資料夾失敗：", err);
      folderSelect.innerHTML = `<option value="預設分類">預設分類</option>`;
    });
}

function getFolder() {
  if (!newFolderGroup.classList.contains("hidden")) return newFolderInput.value.trim();
  return folderSelect.value;
}

// ---------- 資料夾：新增 / 取消 ----------
btnToggleNewFolder.addEventListener("click", () => {
  folderSelect.disabled = true;
  newFolderGroup.classList.remove("hidden");
  newFolderInput.focus();
  btnToggleNewFolder.classList.add("hidden");
  updateBulkPreview();
});

btnCancelNewFolder.addEventListener("click", () => {
  newFolderGroup.classList.add("hidden");
  newFolderInput.value = "";
  folderSelect.disabled = false;
  btnToggleNewFolder.classList.remove("hidden");
  updateBulkPreview();
});

newFolderInput.addEventListener("input", updateBulkPreview);
folderSelect.addEventListener("change", updateBulkPreview);

// ---------- 單筆 / 批次切換 ----------
function switchTab(bulk) {
  tabSingle.classList.toggle("active", !bulk);
  tabBulk.classList.toggle("active", bulk);
  addForm.classList.toggle("hidden", bulk);
  bulkForm.classList.toggle("hidden", !bulk);
  (bulk ? bulkText : enInput).focus();
}
tabSingle.addEventListener("click", () => switchTab(false));
tabBulk.addEventListener("click", () => switchTab(true));

// ---------- 自動查中文 ----------
async function autoTranslate() {
  const wordKey = enInput.value.trim().toLowerCase();
  if (!wordKey) {
    EH.toast("請先輸入英文單字！", "error");
    enInput.focus();
    return;
  }

  if (localDictionary[wordKey]) {
    chInput.value = localDictionary[wordKey].ch;
    posSelect.value = localDictionary[wordKey].pos;
    return;
  }

  btnAutoTranslate.disabled = true;
  btnAutoTranslate.textContent = "查詢中...";
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(wordKey)}&langpair=en|zh-TW`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = data && data.responseData && data.responseData.translatedText;

    // MyMemory 額度用完時，會把警告文字放在 translatedText，必須排除
    if (Number(data && data.responseStatus) === 200 && translated && !/MYMEMORY WARNING/i.test(translated)) {
      chInput.value = translated;
    } else {
      EH.toast("找不到對應的中文（或查詢額度已用完），請手動輸入", "error");
    }
  } catch (e) {
    EH.toast("查詢失敗，請手動輸入中文", "error");
  } finally {
    btnAutoTranslate.disabled = false;
    btnAutoTranslate.textContent = "✨ 自動查中文";
  }
}

btnAutoTranslate.addEventListener("click", autoTranslate);

// 英文欄按 Enter：中文還是空的就先自動查，查完再按一次 Enter 就儲存
enInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !chInput.value.trim() && enInput.value.trim()) {
    e.preventDefault();
    autoTranslate().then(() => {
      if (!chInput.value.trim()) chInput.focus();
    });
  }
});

// ---------- 單筆儲存 ----------
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const folder = getFolder();
  if (!folder) {
    EH.toast("請選擇或輸入資料夾名稱！", "error");
    return;
  }

  const en = enInput.value.trim();
  const ch = chInput.value.trim();
  const pos = posSelect.value;

  if (existingKeys.has(dupKey(folder, en))) {
    const ok = await EH.confirm(`「${en}」在「${folder}」裡已經有了，還要再新增一次嗎？`);
    if (!ok) return;
  }

  try {
    const newRef = await db.collection("users").doc(currentUser.uid).collection("words").add({
      folder, en, pos, ch,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    EH.cache.append(currentUser.uid, [{ id: newRef.id, en, pos, ch, folder, createdAt: Date.now() }]);

    EH.store.set("eh_last_add_folder", folder);
    existingKeys.add(dupKey(folder, en));
    EH.toast(`✅ 已新增「${en}」`, "success");

    enInput.value = "";
    chInput.value = "";
    posSelect.value = "";
    enInput.focus();

    // 若剛剛是新增資料夾，切回下拉選單並選到它
    if (!newFolderGroup.classList.contains("hidden")) {
      btnCancelNewFolder.click();
      await loadUserFolders(currentUser.uid, folder, true);
    }
  } catch (err) {
    EH.toast(`❌ 儲存失敗：${err.message}`, "error", 4000);
  }
});

// ---------- 批次解析 ----------
// 支援：apple, 蘋果 ｜ apple, n., 蘋果 ｜ apple = 蘋果 ｜ apple[Tab]蘋果 ｜ apple[Tab]n.[Tab]蘋果
function parseLine(line) {
  // 1) 有明確分隔符號：逗號、等號、冒號、Tab、「 - 」
  let m = line.match(/^(.+?)(?:\t+|\s*[,，=:：]\s*|\s+[-–—]\s+)(.+)$/);
  let en, rest;
  if (m) {
    en = m[1].trim();
    rest = m[2].trim();
  } else {
    // 2) 手機常見：英文後面直接空白再接中文（可夾詞性），例如「apple 蘋果」「apple n. 蘋果」
    m = line.match(/^([A-Za-z][A-Za-z\s'’.\-]*?)\s+((?:(?:n|v|adj|adv|prep|conj|phr)\.?\s+)?[^\x00-\x7F].*)$/);
    if (!m) return null;
    en = m[1].trim();
    rest = m[2].trim();
  }

  let pos = "";
  const pm = rest.match(/^(n|v|adj|adv|prep|conj|phr)\.?\s*(?:[,，:：]\s*|\s+)(.+)$/i);
  if (pm) {
    pos = pm[1].toLowerCase() + ".";
    rest = pm[2].trim();
  }
  if (!en || !rest) return null;
  return { en, pos, ch: rest };
}

function analyzeBulk() {
  const folder = getFolder();
  const lines = bulkText.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const valid = [];
  const invalid = [];
  let dupCount = 0;
  const seen = new Set();

  lines.forEach((line) => {
    const item = parseLine(line);
    if (!item) { invalid.push(line); return; }
    const key = dupKey(folder || "", item.en);
    if (seen.has(key) || (folder && existingKeys.has(key))) { dupCount++; return; }
    seen.add(key);
    valid.push(item);
  });
  return { folder, valid, invalid, dupCount, total: lines.length };
}

function updateBulkPreview() {
  if (!bulkText) return;
  const { valid, invalid, dupCount, total } = analyzeBulk();
  if (total === 0) {
    bulkPreview.textContent = "貼上內容後會顯示解析結果";
    return;
  }
  let html = `將新增 <b>${valid.length}</b> 筆`;
  if (dupCount) html += `，重複略過 <b>${dupCount}</b> 筆`;
  if (invalid.length) {
    html += `，無法辨識 <b style="color:var(--danger)">${invalid.length}</b> 筆（例：${EH.esc(invalid[0])}）`;
  }
  bulkPreview.innerHTML = html;
}
bulkText.addEventListener("input", updateBulkPreview);

// ---------- 批次儲存 ----------
bulkForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const { folder, valid } = analyzeBulk();
  if (!folder) {
    EH.toast("請選擇或輸入資料夾名稱！", "error");
    return;
  }
  if (valid.length === 0) {
    EH.toast("沒有可新增的單字，請檢查格式（例如：apple, 蘋果）或是否都已重複", "error", 3500);
    return;
  }

  bulkSubmit.disabled = true;
  bulkSubmit.textContent = "儲存中...";

  try {
    const ref = db.collection("users").doc(currentUser.uid).collection("words");
    const BATCH_SIZE = 400;
    const created = [];
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = db.batch();
      valid.slice(i, i + BATCH_SIZE).forEach((w) => {
        const r = ref.doc();
        created.push({ id: r.id, en: w.en, pos: w.pos, ch: w.ch, folder, createdAt: Date.now() });
        batch.set(r, {
          folder, en: w.en, pos: w.pos, ch: w.ch,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
    EH.cache.append(currentUser.uid, created);

    EH.store.set("eh_last_add_folder", folder);
    valid.forEach((w) => existingKeys.add(dupKey(folder, w.en)));
    EH.toast(`✅ 已新增 ${valid.length} 個單字到「${folder}」，可到「背單字」查看`, "success", 4000);
    bulkText.value = "";

    if (!newFolderGroup.classList.contains("hidden")) {
      btnCancelNewFolder.click();
      await loadUserFolders(currentUser.uid, folder, true);
    }
  } catch (err) {
    EH.toast(`❌ 批次儲存失敗：${err.message}`, "error", 4000);
  } finally {
    bulkSubmit.disabled = false;
    bulkSubmit.textContent = "批次儲存";
    updateBulkPreview();
  }
});

// ---------- 從剪貼簿貼上（手機方便） ----------
const btnPaste = document.getElementById("btn-paste");
if (btnPaste) {
  btnPaste.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        EH.toast("剪貼簿是空的", "error");
        return;
      }
      bulkText.value = bulkText.value ? bulkText.value.replace(/\s+$/, "") + "\n" + text : text;
      updateBulkPreview();
    } catch (e) {
      EH.toast("無法讀取剪貼簿，請長按輸入框手動貼上", "error", 3500);
      bulkText.focus();
    }
  });
}

// 讓 add.html 知道這支程式已完整載入（診斷用）
window.__EH_ADD_READY = "3001";
