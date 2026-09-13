const firebaseConfig = {
  apiKey: "AIzaSyA4bbUoXHi29YAjCgYrnuYRhZJ8_JEtalc",
  authDomain: "englishhero-d58c6.firebaseapp.com",
  projectId: "englishhero-d58c6",
  storageBucket: "englishhero-d58c6.firebasestorage.app",
  messagingSenderId: "437927020009",
  appId: "1:437927020009:web:30e18c99cfeec8ef4ef778",
  measurementId: "G-TZTCS02SK6"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let allWords = []; 
let currentFolderWords = []; 
let currentIndex = 0;
let currentFolderForManagement = ""; 

const containerEl = document.getElementById("flashcard-container");
const pageTitleEl = document.getElementById("page-title");
const btnBackFolders = document.getElementById("btn-back-folders");
const editModalContainer = document.getElementById("edit-modal-container");

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    console.log("使用者已登入，UID:", user.uid);
    fetchAllWords(user.uid);
  } else {
    console.log("未偵測到登入使用者，準備導向登入頁面...");
    window.location.replace("login.html?v=2074");
  }
});

function fetchAllWords(uid) {
  console.log("正在從 Firestore 抓取單字...");
  db.collection("users").doc(uid).collection("words").get()
    .then((snapshot) => {
      console.log(`成功抓取單字文件數: ${snapshot.size}`);
      allWords = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        let timeVal = 0;
        if (data.createdAt && typeof data.createdAt.toMillis === 'function') {
          timeVal = data.createdAt.toMillis();
        } else if (data.createdAt && typeof data.createdAt === 'number') {
          timeVal = data.createdAt;
        }

        allWords.push({
          id: doc.id,
          en: data.en || "",
          pos: data.pos || "",
          ch: data.ch || "",
          folder: data.folder || "未分類",
          createdAt: timeVal
        });
      });

      allWords.sort((a, b) => a.createdAt - b.createdAt);
      renderFolderList();
    })
    .catch((err) => {
      console.error("載入失敗詳細資訊：", err);
      containerEl.innerHTML = `<p style="color:red; text-align:center;">載入單字失敗: ${err.message}</p>`;
    });
}

function renderFolderList() {
  pageTitleEl.textContent = "📁 我的單字資料夾";
  btnBackFolders.style.display = "none";
  currentFolderForManagement = "";

  const folderMap = {};
  
  folderMap["🎯 今日背誦計畫"] = [];
  folderMap["📁 昨天的單字"] = [];
  folderMap["📦 已經背過的單字"] = [];

  allWords.forEach(w => {
    const fName = w.folder || "未分類";
    if (!folderMap[fName]) folderMap[fName] = [];
    folderMap[fName].push(w);
  });

  const specialFolders = ["🎯 今日背誦計畫", "📁 昨天的單字", "📦 已經背過的單字"];
  let topBadgesHtml = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
  `;

  specialFolders.forEach((fName) => {
    const count = folderMap[fName].length;
    let badgeColor = "#0284c7";
    let bgLight = "#e0f2fe";
    if (fName.includes("昨天")) {
      badgeColor = "#d97706";
      bgLight = "#fef3c7";
    } else if (fName.includes("背過")) {
      badgeColor = "#059669";
      bgLight = "#d1fae5";
    }

    topBadgesHtml += `
      <div onclick="startStudy('${fName}')" style="background: ${bgLight}; border: 1px solid ${badgeColor}40; padding: 12px 10px; border-radius: 10px; cursor: pointer; text-align: center; transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
        <div style="font-size: 13px; font-weight: bold; color: ${badgeColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fName}</div>
        <div style="font-size: 18px; font-weight: 800; color: ${badgeColor}; margin-top: 4px;">${count} <span style="font-size: 11px; font-weight: normal;">個字</span></div>
      </div>
    `;
  });
  topBadgesHtml += `</div>`;

  let normalFolders = Object.keys(folderMap).filter(name => !specialFolders.includes(name));
  normalFolders.sort((a, b) => a.localeCompare(b));

  let html = topBadgesHtml;
  html += `<div style="font-size: 16px; font-weight: bold; color: #334155; margin-bottom: 10px; border-left: 4px solid #4f46e5; padding-left: 8px;">📚 一般題庫資料夾</div>`;

  if (normalFolders.length === 0) {
    html += `<p style="color: #6b7280; font-size: 14px; text-align: center; padding: 10px;">目前沒有其他自訂資料夾</p>`;
  }

  normalFolders.forEach((folderName, index) => {
    const count = folderMap[folderName].length;
    html += `
      <div class="folder-wrapper" style="margin-bottom: 10px;">
        <div class="folder-item" onclick="startStudy('${folderName}')">
          <div class="folder-info">
            <h3>📁 ${folderName}</h3>
            <p>共 ${count} 個單字 (點擊開始背單字)</p>
          </div>
          
          <div class="dots-container" onclick="event.stopPropagation()">
            <button class="dots-btn" id="dots-btn-${index}" onclick="toggleFolderDropdown(event, '${folderName}', '${index}')">⚙️</button>
          </div>
        </div>
      </div>
    `;
  });

  html += `
    <div style="margin-top: 30px; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 20px;">
      <button onclick="document.getElementById('import-file-input').click()" style="padding: 10px 20px; background: #6366f1; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 4px 10px rgba(99,102,241,0.2);">📥 匯入單字資料 (JSON)</button>
      <input type="file" id="import-file-input" accept=".json" style="display: none;" onchange="importData(event)">
    </div>
  `;

  containerEl.innerHTML = html;
}

window.exportFolderData = function(folderName) {
  const targetWords = allWords.filter(w => w.folder === folderName);
  if (targetWords.length === 0) {
    alert("這個資料夾沒有單字可以匯出！");
    return;
  }

  const exportDataObj = targetWords.map(w => ({
    en: w.en,
    pos: w.pos,
    ch: w.ch,
    folder: w.folder
  }));

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportDataObj, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `english_hero_${folderName}_backup.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
};

window.importData = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedWords = JSON.parse(e.target.result);
      if (!Array.isArray(importedWords)) {
        alert("檔案格式錯誤！");
        return;
      }

      if (!confirm(`確定要匯入這 ${importedWords.length} 個單字嗎？`)) {
        event.target.value = "";
        return;
      }

      const batch = db.batch();
      const userWordsRef = db.collection("users").doc(currentUser.uid).collection("words");

      importedWords.forEach(w => {
        if (w.en && w.ch) {
          const newDocRef = userWordsRef.doc();
          batch.set(newDocRef, {
            en: w.en,
            pos: w.pos || "n.",
            ch: w.ch,
            folder: w.folder || "匯入分類",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      });

      batch.commit().then(() => {
        alert("資料匯入成功！");
        event.target.value = "";
        fetchAllWords(currentUser.uid);
      }).catch(err => {
        alert("匯入失敗：" + err.message);
      });

    } catch (err) {
      alert("解析 JSON 檔案失敗：" + err.message);
    }
  };
  reader.readAsText(file);
};

window.toggleFolderDropdown = function(event, folderName, index) {
  event.stopPropagation();
  
  const existingMenu = document.getElementById("global-dropdown-menu");
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  const btn = document.getElementById(`dots-btn-${index}`);
  if (!btn) return;
  const rect = btn.getBoundingClientRect();

  const menu = document.createElement("div");
  menu.id = "global-dropdown-menu";
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.style.background = "#fff";
  menu.style.border = "1px solid #cbd5e1";
  menu.style.borderRadius = "8px";
  menu.style.boxShadow = "0 10px 25px rgba(0,0,0,0.2)";
  menu.style.zIndex = "999999";
  menu.style.minWidth = "170px";
  menu.style.padding = "4px 0";

  menu.innerHTML = `
    <button onclick="openFolderEditModal('${folderName}'); closeGlobalDropdown();" style="display: block; width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; cursor: pointer; font-size: 14px; color: #334155; font-weight: bold;">✏️ 修改單字</button>
    <button onclick="exportFolderData('${folderName}'); closeGlobalDropdown();" style="display: block; width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; cursor: pointer; font-size: 14px; color: #10b981; font-weight: bold;">📤 匯出此資料夾</button>
    <button onclick="confirmDeleteFolder('${folderName}'); closeGlobalDropdown();" style="display: block; width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; cursor: pointer; font-size: 14px; color: #ef4444; font-weight: bold;">🗑️ 刪除資料夾</button>
  `;

  document.body.appendChild(menu);
};

window.closeGlobalDropdown = function() {
  const menu = document.getElementById("global-dropdown-menu");
  if (menu) menu.remove();
};

document.addEventListener('click', () => {
  closeGlobalDropdown();
});

window.startStudy = function(folderName) {
  currentFolderForManagement = folderName;
  pageTitleEl.textContent = `🎯 背單字：${folderName}`;
  btnBackFolders.style.display = "block";

  currentFolderWords = allWords.filter(w => w.folder === folderName);
  currentIndex = 0;

  renderFlashcard();
};

window.speakWord = function(text, event) {
  if (event) event.stopPropagation();
  if (!text) return;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  } else {
    alert("您的瀏覽器不支援語音朗讀功能！");
  }
};

function renderFlashcard() {
  if (currentFolderWords.length === 0) {
    containerEl.innerHTML = `
      <div style="text-align: center; color: #666; padding: 30px;">
        <p>這個資料夾目前沒有任何單字。</p>
        <button onclick="fetchAllWords(currentUser.uid)" style="margin-top: 10px; padding: 8px 16px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">返回資料夾列表</button>
      </div>
    `;
    return;
  }

  const word = currentFolderWords[currentIndex];

  containerEl.innerHTML = `
    <div class="word-card" style="cursor: default;">
      <span style="position: absolute; top: 16px; right: 20px; font-size: 14px; font-weight: bold; color: #0284c7; background: #e0f2fe; padding: 3px 10px; border-radius: 6px;">
        ${word.pos || '未分類'}
      </span>

      <div style="margin-top: 5px;">
        <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-bottom: 8px;">
          <div style="font-size: 34px; font-weight: bold; color: #1d4ed8;">${word.en}</div>
          <button onclick="speakWord('${word.en}', event)" style="background: #e0f2fe; color: #0284c7; border: none; padding: 6px 12px; border-radius: 20px; font-weight: bold; cursor: pointer; font-size: 13px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">🔊 唸</button>
        </div>

        <div style="font-size: 24px; font-weight: bold; color: #1f2937; margin-top: 12px; border-top: 1px dashed #cbd5e1; padding-top: 12px;">
          ${word.ch}
        </div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
      <button onclick="prevCard()" style="padding: 10px 20px; background: #f3f4f6; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">⬅️ 上一張</button>
      <span style="font-size: 15px; font-weight: bold; color: #475569;">${currentIndex + 1} / ${currentFolderWords.length}</span>
      <button onclick="nextCard()" style="padding: 10px 20px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">下一張 ➡️</button>
    </div>

    <div style="margin-top: 12px; text-align: center;">
      <button onclick="markAsLearned()" style="width: 100%; padding: 12px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 15px; box-shadow: 0 4px 10px rgba(16,185,129,0.2);">
        ✅ 我已經會了 (加入<span>📦 已經背過的單字</span>)
      </button>
    </div>
  `;
}

window.prevCard = function() {
  if (currentFolderWords.length === 0) return;
  currentIndex = (currentIndex - 1 + currentFolderWords.length) % currentFolderWords.length;
  renderFlashcard();
};

window.nextCard = function() {
  if (currentFolderWords.length === 0) return;
  currentIndex = (currentIndex + 1) % currentFolderWords.length;
  renderFlashcard();
};

window.markAsLearned = async function() {
  const word = currentFolderWords[currentIndex];
  if (!word) return;

  try {
    const userWordsRef = db.collection("users").doc(currentUser.uid).collection("words");
    
    await userWordsRef.add({
      en: word.en,
      pos: word.pos || "n.",
      ch: word.ch,
      folder: "📦 已經背過的單字",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert(`太棒了！「${word.en}」已成功加入「📦 已經背過的單字」！`);
    nextCard(); 
  } catch (err) {
    alert("操作失敗：" + err.message);
  }
};

if (btnBackFolders) {
  btnBackFolders.addEventListener("click", () => {
    fetchAllWords(currentUser.uid);
  });
}

window.openFolderEditModal = function(folderName) {
  currentFolderForManagement = folderName;
  const targetWords = allWords.filter(w => w.folder === folderName);

  pageTitleEl.textContent = `✏️ 管理資料夾：${folderName}`;
  btnBackFolders.style.display = "block";

  if (targetWords.length === 0) {
    containerEl.innerHTML = `
      <div style="text-align: center; color: #666; padding: 20px;">
        <p>這個資料夾裡沒有單字。</p>
        <button onclick="fetchAllWords(currentUser.uid)" style="margin-top: 10px; padding: 8px 16px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">返回資料夾列表</button>
      </div>
    `;
    return;
  }

  let html = ``;
  if (folderName === "📦 已經背過的單字") {
    html += `
      <div style="margin-bottom: 15px; text-align: right;">
        <button onclick="confirmDeleteFolder('${folderName}')" style="padding: 8px 14px; background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px;">🗑️ 清空所有已背過單字</button>
      </div>
    `;
  }

  html += `<div style="background: #f8fafc; padding: 10px; border-radius: 8px;">`;
  targetWords.forEach(w => {
    html += `
      <div class="word-row" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #f1f5f9; background: #fff; margin-top: 6px; border-radius: 6px;">
        <div>
          <span style="font-size: 16px; font-weight: bold; color: #1d4ed8;">${w.en}</span>
          <span style="font-size: 12px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">${w.pos || '無詞性'}</span>
          <div style="font-size: 14px; color: #4b5563; margin-top: 2px;">${w.ch}</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button onclick="openSingleEditModal('${w.id}')" style="background: #e0e7ff; color: #4f46e5; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">修改</button>
          <button onclick="deleteSingleWord('${w.id}')" style="background: #fee2e2; color: #ef4444; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">刪除</button>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  html += `
    <div style="margin-top: 15px; text-align: center;">
      <button onclick="fetchAllWords(currentUser.uid)" style="padding: 8px 16px; background: #64748b; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">⬅️ 返回資料夾列表</button>
    </div>
  `;

  containerEl.innerHTML = html;
};

window.openSingleEditModal = function(wordId) {
  const target = allWords.find(w => w.id === wordId);
  if (!target) return;

  editModalContainer.innerHTML = `
    <div class="edit-modal-backdrop">
      <div class="edit-card">
        <h3 style="margin-top: 0; color: #1e293b; margin-bottom: 16px;">✏️ 修改單字資料</h3>
        
        <div class="form-group">
          <label>英文單字 (English)</label>
          <input type="text" id="edit-en" value="${target.en}">
        </div>

        <div class="form-group">
          <label>詞性 (Part of Speech)</label>
          <select id="edit-pos">
            <option value="n." ${target.pos === 'n.' ? 'selected' : ''}>n. (名詞)</option>
            <option value="v." ${target.pos === 'v.' ? 'selected' : ''}>v. (動詞)</option>
            <option value="adj." ${target.pos === 'adj.' ? 'selected' : ''}>adj. (形容詞)</option>
            <option value="adv." ${target.pos === 'adv.' ? 'selected' : ''}>adv. (副詞)</option>
            <option value="prep." ${target.pos === 'prep.' ? 'selected' : ''}>prep. (介系詞)</option>
            <option value="conj." ${target.pos === 'conj.' ? 'selected' : ''}>conj. (連接詞)</option>
            <option value="phr." ${target.pos === 'phr.' ? 'selected' : ''}>phr. (片語)</option>
            <option value="other" ${!['n.','v.','adj.','adv.','prep.','conj.','phr.'].includes(target.pos) ? 'selected' : ''}>其他</option>
          </select>
        </div>

        <div class="form-group">
          <label>中文意思 (Chinese)</label>
          <input type="text" id="edit-ch" value="${target.ch}">
        </div>

        <div class="modal-btns">
          <button class="btn-cancel" onclick="closeEditModal()">取消</button>
          <button class="btn-save" onclick="saveEditedWord('${target.id}')">儲存修改</button>
        </div>
      </div>
    </div>
  `;
};

window.closeEditModal = function() {
  editModalContainer.innerHTML = "";
};

window.saveEditedWord = function(wordId) {
  const newEn = document.getElementById("edit-en").value.trim();
  const newPos = document.getElementById("edit-pos").value;
  const newCh = document.getElementById("edit-ch").value.trim();

  if (!newEn || !newCh) {
    alert("英文與中文不能為空！");
    return;
  }

  db.collection("users").doc(currentUser.uid).collection("words").doc(wordId).update({
    en: newEn,
    pos: newPos,
    ch: newCh
  })
  .then(() => {
    const target = allWords.find(w => w.id === wordId);
    if (target) {
      target.en = newEn;
      target.pos = newPos;
      target.ch = newCh;
    }
    closeEditModal();
    openFolderEditModal(currentFolderForManagement);
  })
  .catch(err => {
    alert("修改失敗：" + err.message);
  });
};

window.deleteSingleWord = function(wordId) {
  if (!confirm("確定要刪除這個單字嗎？")) return;

  db.collection("users").doc(currentUser.uid).collection("words").doc(wordId).delete()
    .then(() => {
      allWords = allWords.filter(w => w.id !== wordId);
      openFolderEditModal(currentFolderForManagement);
    })
    .catch(err => {
      alert("刪除失敗：" + err.message);
    });
};

window.confirmDeleteFolder = function(folderName) {
  if (confirm(`確定要刪除資料夾「${folderName}」以及裡面的所有單字嗎？`)) {
    deleteFolder(folderName);
  }
};

window.deleteFolder = function(folderName) {
  const targetWords = allWords.filter(w => w.folder === folderName);
  const batch = db.batch();

  targetWords.forEach(w => {
    const docRef = db.collection("users").doc(currentUser.uid).collection("words").doc(w.id);
    batch.delete(docRef);
  });

  batch.commit()
    .then(() => {
      allWords = allWords.filter(w => w.folder !== folderName);
      renderFolderList();
    })
    .catch(err => {
      alert("刪除資料夾失敗：" + err.message);
    });
};
