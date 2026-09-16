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
    fetchAllWords(user.uid);
  } else {
    window.location.replace("login.html?v=2074");
  }
});

function fetchAllWords(uid) {
  db.collection("users").doc(uid).collection("words").get()
    .then((snapshot) => {
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
      console.error("載入失敗：", err);
      containerEl.innerHTML = `<p style="color:red; text-align:center;">載入單字失敗</p>`;
    });
}

// 渲染根目錄資料夾列表
function renderFolderList() {
  pageTitleEl.textContent = "📁 我的單字資料夾";
  btnBackFolders.style.display = "none";
  currentFolderForManagement = "";

  const folderMap = {};
  folderMap["📦 已經背過的單字"] = [];

  allWords.forEach(w => {
    let fName = w.folder || "未分類";
    if (!folderMap[fName]) folderMap[fName] = [];
    folderMap[fName].push(w);
  });

  const specialFolders = ["📦 已經背過的單字"];
  let topBadgesHtml = `<div style="margin-bottom: 20px;">`;

  specialFolders.forEach((fName) => {
    const count = folderMap[fName] ? folderMap[fName].length : 0;
    topBadgesHtml += `
      <div style="background: #d1fae5; border: 1px solid #05966940; padding: 14px; border-radius: 10px; text-align: center; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.03); display: flex; justify-content: space-between; align-items: center;">
        <div onclick="startStudy('${fName}')" style="cursor: pointer; text-align: left; flex-grow: 1;">
          <div style="font-size: 14px; font-weight: bold; color: #059669;">📦 ${fName}</div>
          <div style="font-size: 12px; color: #047857; margin-top: 2px;">共 ${count} 個字 (點擊開始複習)</div>
        </div>
        <div>
          <button class="dots-btn" onclick="toggleFolderDropdown(event, '${fName}', 'special-learned')" style="padding: 6px 12px; font-size: 14px; background: #fff; border-radius: 6px; border: 1px solid #a7f3d0; cursor: pointer; color: #059669; font-weight: bold;">⚙️ 管理</button>
        </div>
      </div>
    `;
  });
  topBadgesHtml += `</div>`;

  // 整理出「根目錄資料夾」與「子資料夾」的階層關係
  // 格式若為 "Parent/Child"，則 Parent 是根目錄，Child 是子資料夾
  const rootFoldersMap = {};
  const subFoldersMap = {}; // key: parentName, value: Set of childFolderNames

  Object.keys(folderMap).forEach(fName => {
    if (specialFolders.includes(fName)) return;

    if (fName.includes("/")) {
      const parts = fName.split("/");
      const parent = parts[0];
      if (!subFoldersMap[parent]) subFoldersMap[parent] = new Set();
      subFoldersMap[parent].add(fName);
    } else {
      rootFoldersMap[fName] = folderMap[fName];
    }
  });

  let normalFolders = Object.keys(rootFoldersMap);
  normalFolders.sort((a, b) => a.localeCompare(b));

  let html = topBadgesHtml;
  html += `<div style="font-size: 16px; font-weight: bold; color: #334155; margin-bottom: 10px; border-left: 4px solid #4f46e5; padding-left: 8px;">📚 您的題庫資料夾</div>`;

  if (normalFolders.length === 0 && Object.keys(subFoldersMap).length === 0) {
    html += `<p style="color: #6b7280; font-size: 14px; text-align: center; padding: 10px;">目前沒有其他自訂資料夾</p>`;
  }

  // 渲染獨立的根目錄資料夾，或包含子資料夾的母資料夾
  const allMainFolderNames = Array.from(new Set([...normalFolders, ...Object.keys(subFoldersMap)]));
  allMainFolderNames.sort((a, b) => a.localeCompare(b));

  allMainFolderNames.forEach((folderName, index) => {
    const hasSub = subFoldersMap[folderName] && subFoldersMap[folderName].size > 0;
    
    // 計算總單字數（包含底下的所有子資料夾）
    let totalCount = 0;
    if (rootFoldersMap[folderName]) {
      totalCount += rootFoldersMap[folderName].length;
    }
    if (hasSub) {
      subFoldersMap[folderName].forEach(sub => {
        totalCount += folderMap[sub].length;
      });
    }

    // 如果有子資料夾，點擊時進入子資料夾清單；如果沒有，直接開始背單字
    const clickAction = hasSub ? `openSubFolderView('${folderName}')` : `startStudy('${folderName}')`;
    const subText = hasSub ? `包含 ${subFoldersMap[folderName].size} 個小資料夾 (共 ${totalCount} 個單字)` : `共 ${totalCount} 個單字 (點擊開始背單字)`;

    html += `
      <div class="folder-wrapper" style="margin-bottom: 10px;">
        <div class="folder-item" onclick="${clickAction}">
          <div class="folder-info">
            <h3>📁 ${folderName} ${hasSub ? '<span style="font-size: 12px; background: #e0e7ff; color: #4f46e5; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">階層資料夾</span>' : ''}</h3>
            <p>${subText}</p>
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

// 🌟 開啟子資料夾列表檢視
window.openSubFolderView = function(parentFolderName) {
  pageTitleEl.textContent = `📁 ${parentFolderName} - 小資料夾列表`;
  btnBackFolders.style.display = "block";

  // 找出屬於這個 parent 的所有子資料夾
  const subFolders = Array.from(new Set(allWords.map(w => w.folder)))
    .filter(f => f.startsWith(`${parentFolderName}/`));

  subFolders.sort((a, b) => a.localeCompare(b));

  let html = `
    <div style="margin-bottom: 15px; font-size: 14px; color: #64748b;">
      點擊下方的小資料夾即可開始背單字或管理：
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px;">
  `;

  subFolders.forEach((subFolderFullName, index) => {
    const subName = subFolderFullName.split("/")[1];
    const count = allWords.filter(w => w.folder === subFolderFullName).length;

    html += `
      <div class="folder-wrapper" style="margin-bottom: 0;">
        <div class="folder-item" onclick="startStudy('${subFolderFullName}')">
          <div class="folder-info">
            <h3>📂 ${subName}</h3>
            <p>共 ${count} 個單字 (點擊開始背單字)</p>
          </div>
          <div class="dots-container" onclick="event.stopPropagation()">
            <button class="dots-btn" id="sub-dots-${index}" onclick="toggleFolderDropdown(event, '${subFolderFullName}', 'sub-${index}')">⚙️</button>
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  html += `
    <div style="margin-top: 25px; text-align: center;">
      <button onclick="renderFolderList()" style="padding: 8px 16px; background: #64748b; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">⬅️ 返回根目錄資料夾</button>
    </div>
  `;

  containerEl.innerHTML = html;
};

window.exportFolderData = function(folderName) {
  const targetWords = allWords.filter(w => w.folder === folderName || w.folder.startsWith(`${folderName}/`));
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
  downloadAnchor.setAttribute("download", `english_hero_${folderName.replace('/', '_')}_backup.json`);
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

// 🌟 拆分資料夾功能（改為建立 Parent/Part 格式的子資料夾）
window.splitFolder = function(folderName) {
  const targetWords = allWords.filter(w => w.folder === folderName);
  if (targetWords.length === 0) {
    alert("這個資料夾沒有單字可以拆分！");
    return;
  }

  const input = prompt(`請輸入每個小資料夾要包含幾個單字？（目前總共有 ${targetWords.length} 個單字）`, "10");
  if (!input) return;

  const size = parseInt(input);
  if (isNaN(size) || size <= 0) {
    alert("請輸入有效的數字！");
    return;
  }

  if (!confirm(`確定要將「${folderName}」以每 ${size} 個單字為一組，拆分為階層式小資料夾嗎？`)) {
    return;
  }

  const batch = db.batch();
  const userWordsRef = db.collection("users").doc(currentUser.uid).collection("words");

  let partCount = 1;
  for (let i = 0; i < targetWords.length; i += size) {
    const chunk = targetWords.slice(i, i + size);
    const newFolderName = `${folderName}/Part ${partCount}`;
    
    chunk.forEach(w => {
      const docRef = userWordsRef.doc(w.id);
      batch.update(docRef, { folder: newFolderName });
    });
    partCount++;
  }

  batch.commit()
    .then(() => {
      alert(`🎉 成功將大資料夾拆分為 ${partCount - 1} 個小資料夾！`);
      fetchAllWords(currentUser.uid);
    })
    .catch(err => {
      alert("拆分失敗：" + err.message);
    });
};

window.toggleFolderDropdown = function(event, folderName, index) {
  event.stopPropagation();
  
  const existingMenu = document.getElementById("global-dropdown-menu");
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  let btn;
  if (index === 'special-learned') {
    btn = event.currentTarget;
  } else if (String(index).startsWith('sub-')) {
    btn = document.getElementById(`sub-dots-${index.replace('sub-', '')}`);
  } else {
    btn = document.getElementById(`dots-btn-${index}`);
  }
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
  menu.style.minWidth = "180px";
  menu.style.padding = "4px 0";

  const deleteText = folderName.includes("已經背過") ? `🗑️ 清空已背過單字` : `🗑️ 刪除資料夾`;

  let splitBtnHtml = "";
  // 只有非子資料夾且非已背過的夾子可以再拆分
  if (!folderName.includes("已經背過") && !folderName.includes("/")) {
    splitBtnHtml = `<button onclick="splitFolder('${folderName}'); closeGlobalDropdown();" style="display: block; width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; cursor: pointer; font-size: 14px; color: #4f46e5; font-weight: bold;">📦 拆分為多個子資料夾</button>`;
  }

  menu.innerHTML = `
    <button onclick="openFolderEditModal('${folderName}'); closeGlobalDropdown();" style="display: block; width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; cursor: pointer; font-size: 14px; color: #334155; font-weight: bold;">✏️ 管理單字</button>
    ${splitBtnHtml}
    <button onclick="exportFolderData('${folderName}'); closeGlobalDropdown();" style="display: block; width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; cursor: pointer; font-size: 14px; color: #10b981; font-weight: bold;">📤 匯出此資料夾</button>
    <button onclick="confirmDeleteFolder('${folderName}'); closeGlobalDropdown();" style="display: block; width: 100%; text-align: left; padding: 10px 14px; background: none; border: none; cursor: pointer; font-size: 14px; color: #ef4444; font-weight: bold;">${deleteText}</button>
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
        ✅ 我已經會了 (加入「📦 已經背過的單字」)
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
    // 如果在子資料夾檢視內，點上一頁回到根目錄；否則重新載入根目錄
    renderFolderList();
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
        <p>這個資料夾裡沒有直接的單字（可能包含子資料夾）。</p>
        <button onclick="renderFolderList()" style="margin-top: 10px; padding: 8px 16px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">返回資料夾列表</button>
      </div>
    `;
    return;
  }

  let html = ``;
  if (folderName.includes("已經背過")) {
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
      <button onclick="renderFolderList()" style="padding: 8px 16px; background: #64748b; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">⬅️ 返回資料夾列表</button>
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
  const msg = folderName.includes("/") ? `確定要刪除小資料夾「${folderName}」以及裡面的所有單字嗎？` : `確定要刪除大資料夾「${folderName}」以及底下所有的子資料夾與單字嗎？`;
  if (confirm(msg)) {
    deleteFolder(folderName);
  }
};

window.deleteFolder = function(folderName) {
  // 如果刪除的是大資料夾，連同底下所有帶有 "folderName/" 的子資料夾一起刪除
  const targetWords = allWords.filter(w => w.folder === folderName || w.folder.startsWith(`${folderName}/`));
  const batch = db.batch();

  targetWords.forEach(w => {
    const docRef = db.collection("users").doc(currentUser.uid).collection("words").doc(w.id);
    batch.delete(docRef);
  });

  batch.commit()
    .then(() => {
      allWords = allWords.filter(w => w.folder !== folderName && !w.folder.startsWith(`${folderName}/`));
      renderFolderList();
    })
    .catch(err => {
      alert("刪除資料夾失敗：" + err.message);
    });
};
